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
};

type QueryRow = {
  query_id: string;
  query_text: string;
  broll_jsonb: unknown;
  audio_url: string | null;
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

const DEFAULT_INDEX_API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://yolocut-server.vercel.app"
    : "http://127.0.0.1:8080";
const INDEX_API_BASE_URL =
  process.env.NEXT_PUBLIC_YOLOCUT_SERVER_URL ?? DEFAULT_INDEX_API_BASE_URL;

const CAPTION_FONT_FAMILY = "theboldfont";
const CAPTION_FONT_URL = "https://cdn.designcombo.dev/fonts/the-bold-font.ttf";

const resolveApiUrl = (url: string) => {
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
    const trimToMs = Math.max(trimFromMs + 1000, clip.end_time * 1000);
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
  captions: CaptionToken[],
  audioDurationMs: number,
): EditorPayload => {
  const rows = Array.isArray(query.broll_jsonb) ? (query.broll_jsonb as SearchRow[]) : [];
  const clips = rows
    .map((row) => row.results?.[0])
    .filter((result): result is SearchClipResult => Boolean(result));

  const videoItems = buildVideoItems(clips);
  const visualDurationMs = videoItems.reduce(
    (total, item) => Math.max(total, item.display.to),
    0,
  );

  const audioSrc = resolveBlobProxyUrl(query.audio_url);
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
        metadata: { sourceUrl: audioSrc },
        details: { src: audioSrc, volume: 100 },
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

  return {
    trackItems: [...videoItems, ...(audioItem ? [audioItem] : []), ...captionItems],
    tracks,
  };
};

export const StudioEditorClient = ({ queryId }: { queryId: string }) => {
  const [payload, setPayload] = useState<EditorPayload | undefined>();

  useEffect(() => {
    let cancelled = false;

    const loadStudio = async () => {
      const response = await fetch(`/api/queries/${queryId}`);

      if (!response.ok) {
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

      await loadFonts([{ name: CAPTION_FONT_FAMILY, url: CAPTION_FONT_URL }]).catch(
        () => undefined,
      );

      if (cancelled) {
        return;
      }

      setPayload(buildEditorPayload(query, captions, audioDurationMs));
    };

    void loadStudio();

    return () => {
      cancelled = true;
    };
  }, [queryId]);

  return <Editor id={queryId} initialDesign={payload} />;
};
