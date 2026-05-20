"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { generateId } from "@designcombo/timeline";
import { generateCaptions } from "@/features/editor/utils/captions";
import { loadFonts } from "@/features/editor/utils/fonts";

const Editor = dynamic(() => import("@/features/editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-background text-sm font-semibold text-muted-foreground">
      Loading studio...
    </div>
  ),
});

type SearchClipResult = {
  rank: number;
  source_file: string;
  source_basename: string;
  start_time: number;
  end_time: number;
  start_time_formatted: string;
  end_time_formatted: string;
  similarity_score: number;
  clip_path: string | null;
  clip_url: string | null;
  clip_stream_url?: string | null;
};

type SearchRow = {
  index: number;
  visual_broll: string;
  query?: string;
  results: SearchClipResult[];
  selected_result?: SearchClipResult | null;
  prompt_time_range?: {
    start?: number;
    end?: number;
  } | null;
};

type QueryRow = {
  query_id: string;
  query_text: string;
  broll_jsonb: unknown;
  audio_url: string | null;
  music_url: string | null;
  captions_url: string | null;
};

type CaptionToken = {
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number | null;
};

type EditorPayload = {
  trackItems: unknown[];
  tracks: unknown[];
};

type StudioLoadState = {
  message: string;
  error?: string;
};

const DEFAULT_INDEX_API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://yolocut-server.vercel.app"
    : "http://127.0.0.1:8080";
const INDEX_API_BASE_URL =
  process.env.NEXT_PUBLIC_YOLOCUT_SERVER_URL ?? DEFAULT_INDEX_API_BASE_URL;

const CAPTION_FONT_FAMILY = "theboldfont";
const CAPTION_FONT_URL = "https://cdn.designcombo.dev/fonts/the-bold-font.ttf";

const resolveApiUrl = (url: string) => {
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsedUrl = new URL(url);

      if (parsedUrl.hostname.endsWith(".blob.vercel-storage.com")) {
        return `/api/broll-video?pathname=${encodeURIComponent(
          parsedUrl.pathname.replace(/^\/+/, ""),
        )}`;
      }
    } catch {
      return url;
    }

    return url;
  }

  if (url.startsWith("/api/")) {
    return url;
  }

  return `${INDEX_API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
};

const resolveSourceUrl = (result: SearchClipResult) => {
  if (result.clip_stream_url) {
    return resolveApiUrl(result.clip_stream_url);
  }

  if (result.clip_url) {
    return resolveApiUrl(result.clip_url);
  }

  if (!result.source_file) {
    return null;
  }

  return resolveApiUrl(`/clips?path=${encodeURIComponent(result.source_file)}`);
};

const getClipDuration = (clip: SearchClipResult) => {
  return Math.max(0, clip.end_time - clip.start_time);
};

const formatClipTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.max(0, seconds - minutes * 60);

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toFixed(2)
    .padStart(5, "0")}`;
};

const getBlobPathname = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }

  if (value.startsWith("/api/broll-video")) {
    return new URL(value, window.location.origin).searchParams.get("pathname") ?? "";
  }

  try {
    const parsedUrl = new URL(value);

    if (parsedUrl.hostname.endsWith(".blob.vercel-storage.com")) {
      return parsedUrl.pathname.replace(/^\/+/, "");
    }

    if (parsedUrl.pathname === "/api/broll-video") {
      return parsedUrl.searchParams.get("pathname") ?? "";
    }
  } catch {
    return value.replace(/^\/+/, "");
  }

  return "";
};

const expandClipToDuration = (clip: SearchClipResult, durationSeconds: number) => {
  const targetDuration = Math.max(0.6, durationSeconds);
  const sourceDuration = getClipDuration(clip);
  const center = sourceDuration > 0 ? clip.start_time + sourceDuration / 2 : clip.start_time;
  const start = Math.max(0, center - targetDuration / 2);
  const end = start + targetDuration;

  return {
    ...clip,
    start_time: start,
    end_time: end,
    start_time_formatted: formatClipTime(start),
    end_time_formatted: formatClipTime(end),
  };
};

const getClipForRow = (row: SearchRow) => {
  const selected = row.selected_result;
  const fallback = row.results?.[0];

  if (!selected) {
    return fallback ?? null;
  }

  const hasEphemeralPreview =
    selected.clip_url?.startsWith("blob:") || selected.clip_stream_url?.startsWith("blob:");
  const segmentDuration =
    typeof row.prompt_time_range?.start === "number" && typeof row.prompt_time_range?.end === "number"
      ? Math.max(0.6, row.prompt_time_range.end - row.prompt_time_range.start)
      : getClipDuration(selected);

  if (hasEphemeralPreview && fallback) {
    return expandClipToDuration(fallback, segmentDuration);
  }

  return selected;
};

const trimClipToObjectUrl = async (clip: SearchClipResult) => {
  const pathname =
    getBlobPathname(clip.source_file) ||
    getBlobPathname(clip.clip_stream_url) ||
    getBlobPathname(clip.clip_url);

  if (!pathname) {
    return clip;
  }

  const response = await fetch("/api/clip-trim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pathname,
      start: clip.start_time,
      end: clip.end_time,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Failed to prepare ${clip.source_basename}`);
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const duration = getClipDuration(clip);

  return {
    ...clip,
    clip_url: objectUrl,
    clip_stream_url: objectUrl,
    start_time: 0,
    end_time: duration,
    start_time_formatted: formatClipTime(0),
    end_time_formatted: formatClipTime(duration),
  };
};

const preparePlayableClips = async (
  clips: SearchClipResult[],
  onProgress: (completed: number, total: number) => void,
) => {
  const playableClips: SearchClipResult[] = [];

  // Keep this sequential on purpose. Several concurrent ffmpeg HTTP trims can
  // starve each other and leave Remotion previewing the original private MOVs,
  // which is what caused the black-frame playback in Studio.
  for (const clip of clips) {
    playableClips.push(await trimClipToObjectUrl(clip));
    onProgress(playableClips.length, clips.length);
  }

  return playableClips;
};

// Both audio (.mp3) and captions (.captions.json) live under `${user}_audio/`,
// so the query-audio-stream route proxies either one out of the private blob.
const resolveBlobProxyUrl = (blobUrl: string | null) => {
  if (!blobUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(blobUrl);
    return `/api/query-audio-stream?pathname=${encodeURIComponent(
      parsedUrl.pathname.replace(/^\/+/, ""),
    )}`;
  } catch {
    return blobUrl;
  }
};

const probeAudioDurationMs = (src: string) => {
  return new Promise<number>((resolve) => {
    if (!src) {
      resolve(0);
      return;
    }

    const audio = new Audio();
    const settle = (durationMs: number) => {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      resolve(durationMs);
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      settle(Number.isFinite(audio.duration) ? audio.duration * 1000 : 0);
    };
    audio.onerror = () => settle(0);
    window.setTimeout(() => settle(0), 8000);
    audio.src = src;
  });
};

const buildVideoItems = (clips: SearchClipResult[]) => {
  let cursorMs = 0;

  return clips.flatMap((clip, index) => {
    const src = resolveSourceUrl(clip);

    if (!src) {
      return [];
    }

    const trimFromMs = Math.max(0, clip.start_time * 1000);
    const trimToMs = Math.max(trimFromMs + 600, clip.end_time * 1000);
    const clipDurationMs = trimToMs - trimFromMs;

    const item = {
      id: generateId(),
      type: "video",
      name: clip.source_basename || `Clip ${index + 1}`,
      display: { from: cursorMs, to: cursorMs + clipDurationMs },
      trim: { from: trimFromMs, to: trimToMs },
      // duration must cover trim.to so the trimmed segment is not clamped.
      duration: trimToMs,
      playbackRate: 1,
      isMain: false,
      metadata: { sourceUrl: src },
      details: {
        src,
        width: 1080,
        height: 1920,
        opacity: 100,
        volume: 0,
        transform: "none",
        top: "0px",
        left: "0px",
        borderRadius: 0,
        borderWidth: 0,
        borderColor: "#000000",
        boxShadow: { color: "#000000", x: 0, y: 0, blur: 0 },
        blur: 0,
        brightness: 100,
        flipX: false,
        flipY: false,
        rotate: "0deg",
        visibility: "visible",
      },
    };

    cursorMs += clipDurationMs;
    return [item];
  });
};

const buildCaptionItems = (captions: CaptionToken[], audioSrc: string, parentId: string) => {
  const words = captions
    .map((caption) => ({
      word: (caption.text ?? "").trim(),
      start: Math.max(0, (caption.startMs ?? 0) / 1000),
      end: Math.max(0, (caption.endMs ?? 0) / 1000),
      confidence: typeof caption.confidence === "number" ? caption.confidence : 1,
    }))
    .filter((word) => word.word.length > 0);

  if (words.length === 0) {
    return [];
  }

  try {
    return generateCaptions(
      { sourceUrl: audioSrc || "captions", results: { main: { words } } },
      { fontFamily: CAPTION_FONT_FAMILY, fontUrl: CAPTION_FONT_URL, fontSize: 64 },
      { containerWidth: 800, linesPerCaption: 1, parentId, displayFrom: 0 },
    );
  } catch (error) {
    console.error("Failed to build caption items", error);
    return [];
  }
};

const buildEditorPayload = (
  query: QueryRow,
  clips: SearchClipResult[],
  captions: CaptionToken[],
  audioDurationMs: number,
  musicDurationMs: number,
): EditorPayload => {
  const videoItems = buildVideoItems(clips);
  const visualDurationMs = videoItems.reduce(
    (total, item) => Math.max(total, item.display.to),
    0,
  );

  const audioSrc = resolveBlobProxyUrl(query.audio_url);
  const musicSrc = resolveBlobProxyUrl(query.music_url);
  const audioId = generateId();
  const audioDuration = audioDurationMs > 0 ? audioDurationMs : visualDurationMs || 1000;
  const audioItem = audioSrc
    ? {
        id: audioId,
        type: "audio",
        name: "Voiceover",
        display: { from: 0, to: audioDuration },
        trim: { from: 0, to: audioDuration },
        duration: audioDuration,
        playbackRate: 1,
        isMain: false,
        metadata: { sourceUrl: audioSrc, previewUrl: "Voiceover" },
        details: { src: audioSrc, volume: 100 },
      }
    : null;
  const musicItem = musicSrc
    ? {
        id: generateId(),
        type: "audio",
        name: "Music",
        display: { from: 0, to: musicDurationMs > 0 ? musicDurationMs : audioDuration },
        trim: { from: 0, to: musicDurationMs > 0 ? musicDurationMs : audioDuration },
        duration: musicDurationMs > 0 ? musicDurationMs : audioDuration,
        playbackRate: 1,
        isMain: false,
        metadata: { sourceUrl: musicSrc, previewUrl: "Music" },
        details: { src: musicSrc, volume: 10 },
      }
    : null;

  const captionItems = buildCaptionItems(captions, audioSrc, audioId);

  const tracks: unknown[] = [];

  if (captionItems.length > 0) {
    tracks.push({
      id: generateId(),
      type: "caption",
      name: "Captions",
      items: captionItems.map((item) => item.id),
    });
  }

  if (videoItems.length > 0) {
    tracks.push({
      id: generateId(),
      type: "video",
      name: "Visuals",
      items: videoItems.map((item) => item.id),
    });
  }

  if (audioItem) {
    tracks.push({
      id: generateId(),
      type: "audio",
      name: "Voiceover",
      items: [audioItem.id],
    });
  }

  if (musicItem) {
    tracks.push({
      id: generateId(),
      type: "audio",
      name: "Music",
      items: [musicItem.id],
    });
  }

  return {
    trackItems: [
      ...videoItems,
      ...(audioItem ? [audioItem] : []),
      ...(musicItem ? [musicItem] : []),
      ...captionItems,
    ],
    tracks,
  };
};

export const StudioEditorClient = ({ queryId }: { queryId: string }) => {
  const [payload, setPayload] = useState<EditorPayload | undefined>();
  const [loadState, setLoadState] = useState<StudioLoadState>({
    message: "Preparing studio...",
  });

  useEffect(() => {
    let cancelled = false;

    const loadStudio = async () => {
      setLoadState({ message: "Loading saved cut..." });
      const response = await fetch(`/api/queries/${queryId}`);

      if (!response.ok) {
        setLoadState({ message: "Studio failed to load.", error: "Could not load this query." });
        return;
      }

      const data = (await response.json()) as { query: QueryRow };
      const query = data.query;

      let captions: CaptionToken[] = [];
      if (query.captions_url) {
        try {
          const captionsResponse = await fetch(resolveBlobProxyUrl(query.captions_url));
          if (captionsResponse.ok) {
            captions = (await captionsResponse.json()) as CaptionToken[];
          }
        } catch (error) {
          console.error("Failed to load captions", error);
        }
      }

      const audioDurationMs = await probeAudioDurationMs(resolveBlobProxyUrl(query.audio_url));
      const musicDurationMs = await probeAudioDurationMs(resolveBlobProxyUrl(query.music_url));
      const rows = Array.isArray(query.broll_jsonb) ? (query.broll_jsonb as SearchRow[]) : [];
      const selectedClips = rows.map(getClipForRow).filter((clip): clip is SearchClipResult => Boolean(clip));
      setLoadState({
        message:
          selectedClips.length > 0
            ? `Preparing 0/${selectedClips.length} timeline clips...`
            : "Preparing audio and captions...",
      });
      const playableClips = await preparePlayableClips(selectedClips, (completed, total) => {
        if (!cancelled) {
          setLoadState({ message: `Preparing ${completed}/${total} timeline clips...` });
        }
      });

      await loadFonts([{ name: CAPTION_FONT_FAMILY, url: CAPTION_FONT_URL }]).catch(
        () => undefined,
      );

      if (cancelled) {
        return;
      }

      setPayload(buildEditorPayload(query, playableClips, captions, audioDurationMs, musicDurationMs));
      setLoadState({ message: "Studio ready." });
    };

    void loadStudio().catch((error) => {
      if (!cancelled) {
        setLoadState({
          message: "Studio failed to prepare playback.",
          error: error instanceof Error ? error.message : "Unknown studio loading error",
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [queryId]);

  if (!payload) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="rounded-2xl border border-border bg-card px-6 py-5 text-center shadow-sm">
          <p className="font-playfair text-2xl font-bold text-foreground">{loadState.message}</p>
          {loadState.error ? (
            <p className="mt-2 max-w-md text-sm text-destructive">{loadState.error}</p>
          ) : (
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Building local MP4 slices so preview playback, captions, voiceover, and music start cleanly.
            </p>
          )}
        </div>
      </div>
    );
  }

  return <Editor id={queryId} initialDesign={payload} />;
};
