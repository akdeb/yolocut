"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

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
};

const DEFAULT_INDEX_API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://yolocut-server.vercel.app"
    : "http://127.0.0.1:8080";
const INDEX_API_BASE_URL =
  process.env.NEXT_PUBLIC_YOLOCUT_SERVER_URL ?? DEFAULT_INDEX_API_BASE_URL;

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

const getAudioStreamUrl = (audioUrl: string | null) => {
  if (!audioUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(audioUrl);
    return `/api/query-audio-stream?pathname=${encodeURIComponent(
      parsedUrl.pathname.replace(/^\/+/, ""),
    )}`;
  } catch {
    return audioUrl;
  }
};

const createId = (prefix: string, index: number) => `${prefix}_${index}_${Date.now()}`;

const buildInitialDesign = (query: QueryRow) => {
  const rows = Array.isArray(query.broll_jsonb) ? (query.broll_jsonb as SearchRow[]) : [];
  const clips = rows
    .map((row) => row.results?.[0])
    .filter((result): result is SearchClipResult => Boolean(result));
  let cursorMs = 0;

  const visualItems = clips.flatMap((clip, index) => {
    const src = resolveSourceUrl(clip);

    if (!src) {
      return [];
    }

    const clipDurationMs = Math.max(1000, (clip.end_time - clip.start_time) * 1000);
    const id = createId("video", index);
    const item = {
      id,
      details: {
        width: 1080,
        height: 1920,
        opacity: 100,
        src,
        volume: 0,
        borderRadius: 0,
        borderWidth: 0,
        borderColor: "#000000",
        boxShadow: {
          color: "#000000",
          x: 0,
          y: 0,
          blur: 0,
        },
        top: 0,
        left: 0,
        transform: "none",
        blur: 0,
        brightness: 100,
        flipX: false,
        flipY: false,
        rotate: "0deg",
        visibility: "visible",
      },
      metadata: {
        sourceUrl: src,
        sourceFile: clip.source_file,
      },
      trim: {
        from: Math.max(0, clip.start_time * 1000),
        to: Math.max(clip.start_time * 1000 + 1, clip.end_time * 1000),
      },
      type: "video",
      name: clip.source_basename || `Clip ${index + 1}`,
      playbackRate: 1,
      display: {
        from: cursorMs,
        to: cursorMs + clipDurationMs,
      },
      duration: clipDurationMs,
      isMain: false,
    };

    cursorMs += clipDurationMs;
    return [item];
  });

  const totalDurationMs = Math.max(cursorMs, 1000);
  const audioSrc = getAudioStreamUrl(query.audio_url);
  const audioItem = audioSrc
    ? [
        {
          id: createId("audio", 0),
          details: {
            src: audioSrc,
            volume: 100,
          },
          metadata: {
            sourceUrl: audioSrc,
          },
          trim: {
            from: 0,
            to: totalDurationMs,
          },
          type: "audio",
          name: "Voiceover",
          playbackRate: 1,
          display: {
            from: 0,
            to: totalDurationMs,
          },
          duration: totalDurationMs,
          isMain: false,
        },
      ]
    : [];

  const trackItems = [...visualItems, ...audioItem];

  return {
    id: query.query_id,
    fps: 30,
    size: {
      width: 1080,
      height: 1920,
    },
    tracks: [
      {
        id: "yolocut_visual_track",
        items: visualItems.map((item) => item.id),
        type: "video",
        name: "Visuals",
        magnetic: false,
        static: false,
      },
      ...(audioItem.length > 0
        ? [
            {
              id: "yolocut_audio_track",
              items: audioItem.map((item) => item.id),
              type: "audio",
              name: "Voiceover",
              magnetic: false,
              static: false,
            },
          ]
        : []),
    ],
    trackItemIds: trackItems.map((item) => item.id),
    transitionsMap: {},
    trackItemsMap: Object.fromEntries(trackItems.map((item) => [item.id, item])),
    transitionIds: [],
    duration: totalDurationMs,
  };
};

export const StudioEditorClient = ({ queryId }: { queryId: string }) => {
  const [query, setQuery] = useState<QueryRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadQuery = async () => {
      const response = await fetch(`/api/queries/${queryId}`);

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { query: QueryRow };

      if (!cancelled) {
        setQuery(data.query);
      }
    };

    void loadQuery();

    return () => {
      cancelled = true;
    };
  }, [queryId]);

  const initialDesign = useMemo(() => (query ? buildInitialDesign(query) : undefined), [query]);

  return <Editor id={queryId} initialDesign={initialDesign} />;
};
