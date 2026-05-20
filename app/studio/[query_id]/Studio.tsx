"use client";

/* eslint-disable @remotion/warn-native-media-tag */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Captions,
  ChevronRight,
  Loader2,
  Music,
  Video,
  Volume2,
} from "lucide-react";
import { FinalVideo } from "../../create/FinalVideo";
import { getSearchResultId, type SearchClipResult, type SearchRow } from "../../create/Search";

type VisualBrollPrompt = {
  visual_broll: string;
  transcript?: string;
};

type QueryRow = {
  query_id: string;
  created_at: string;
  query_text: string;
  broll_jsonb: unknown;
  audio_url: string | null;
  music_url: string | null;
  captions_url: string | null;
};

type BatchSearchResponse = {
  rows: Array<{
    index: number;
    visual_broll: string;
    query?: string;
    results: SearchClipResult[];
  }>;
};

type StudioProps = {
  queryId: string;
};

type ChatMessage = {
  role: "agent" | "user";
  text: string;
};

type TimelineTrack = "captions" | "visuals" | "tts" | "music";

const DEFAULT_INDEX_API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://yolocut-server.vercel.app"
    : "http://127.0.0.1:8080";
const INDEX_API_BASE_URL =
  process.env.NEXT_PUBLIC_YOLOCUT_SERVER_URL ?? DEFAULT_INDEX_API_BASE_URL;

const parseVisualBrollPrompts = (value: string): VisualBrollPrompt[] => {
  const parsedValue = JSON.parse(value) as unknown;
  const parsed = Array.isArray(parsedValue) ? parsedValue : [parsedValue];

  return parsed.map((item, index) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("visual_broll" in item) ||
      typeof item.visual_broll !== "string" ||
      item.visual_broll.trim().length === 0
    ) {
      throw new Error(`Query item ${index + 1} must include visual_broll.`);
    }

    const transcript =
      "transcript" in item && typeof item.transcript === "string" ? item.transcript.trim() : "";

    return transcript
      ? { visual_broll: item.visual_broll.trim(), transcript }
      : { visual_broll: item.visual_broll.trim() };
  });
};

const toSearchRows = (rows: BatchSearchResponse["rows"]): SearchRow[] => {
  return rows.map((row) => ({
    id: `${row.index}-${row.visual_broll}`,
    query: row.query ?? row.visual_broll,
    results: row.results.slice(0, 5),
  }));
};

const getAudioStreamUrl = (audioUrl: string | null) => {
  if (!audioUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(audioUrl);
    return `/api/query-audio-stream?pathname=${encodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""))}`;
  } catch {
    return audioUrl;
  }
};

const getClipDuration = (clip: SearchClipResult) => Math.max(0, clip.end_time - clip.start_time);

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const getClipLabel = (clip: SearchClipResult) => {
  const basename = clip.source_basename.replace(/\.[^.]+$/, "");
  return basename.length > 24 ? `${basename.slice(0, 24)}...` : basename;
};

const Waveform = () => {
  const bars = Array.from({ length: 42 }, (_, index) => {
    const height = 22 + ((index * 17) % 46);
    return height;
  });

  return (
    <div className="flex h-full items-center gap-1 px-3">
      {bars.map((height, index) => (
        <span
          key={index}
          className="w-1 rounded-full bg-violet-300"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
};

const StudioTimeline = ({
  clips,
  audioUrl,
  audioDuration,
  selectedTrack,
  onSelectTrack,
}: {
  clips: SearchClipResult[];
  audioUrl: string;
  audioDuration: number;
  selectedTrack: TimelineTrack;
  onSelectTrack: (track: TimelineTrack) => void;
}) => {
  const visualDuration = clips.reduce((duration, clip) => duration + getClipDuration(clip), 0);
  const totalDuration = Math.max(visualDuration, audioDuration, 1);
  const rowClass = (track: TimelineTrack) =>
    selectedTrack === track
      ? "grid grid-cols-[76px_minmax(0,1fr)] items-center gap-2 rounded-xl bg-emerald-50 px-2 py-1.5 ring-1 ring-emerald-200"
      : "grid grid-cols-[76px_minmax(0,1fr)] items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-neutral-100";
  const labelClass = "flex items-center gap-2 text-xs font-bold text-neutral-500";

  return (
    <section className="w-full max-w-4xl">
      <div className="mb-2 flex justify-end">
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-500">
          {formatTime(totalDuration)}
        </span>
      </div>

      <div className="grid gap-1">
        <button className={rowClass("captions")} type="button" onClick={() => onSelectTrack("captions")}>
          <div className={labelClass}>
            <Captions className="size-4" />
            Captions
          </div>
          <div className="h-8 rounded-lg border border-dashed border-neutral-200 bg-white/60" />
        </button>

        <button className={rowClass("visuals")} type="button" onClick={() => onSelectTrack("visuals")}>
          <div className={labelClass}>
            <Video className="size-4" />
            Visuals
          </div>
          <div className="flex h-10 gap-1 overflow-hidden rounded-lg bg-neutral-100 p-1">
            {clips.length > 0 ? (
              clips.map((clip, index) => {
                const width = Math.max(8, (getClipDuration(clip) / totalDuration) * 100);

                return (
                  <div
                    key={`${clip.source_file}-${clip.start_time}-${index}`}
                    className="flex min-w-16 items-center overflow-hidden rounded-md bg-emerald-500 px-2 text-xs font-bold text-white"
                    style={{ width: `${width}%` }}
                    title={`${clip.source_basename} ${clip.start_time_formatted} - ${clip.end_time_formatted}`}
                  >
                    <span className="truncate">{getClipLabel(clip)}</span>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-1 items-center rounded-md border border-dashed border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-400" />
            )}
          </div>
        </button>

        <button className={rowClass("tts")} type="button" onClick={() => onSelectTrack("tts")}>
          <div className={labelClass}>
            <Volume2 className="size-4" />
            TTS
          </div>
          <div className="h-10 overflow-hidden rounded-lg bg-violet-100">
            {audioUrl ? <Waveform /> : <div className="h-full rounded-lg border border-dashed border-violet-200 bg-white/60" />}
          </div>
        </button>

        <button className={rowClass("music")} type="button" onClick={() => onSelectTrack("music")}>
          <div className={labelClass}>
            <Music className="size-4" />
            Music
          </div>
          <div className="h-8 rounded-lg border border-dashed border-neutral-200 bg-white/60" />
        </button>
      </div>
    </section>
  );
};

export const Studio = ({ queryId }: StudioProps) => {
  const [query, setQuery] = useState<QueryRow | null>(null);
  const [queryText, setQueryText] = useState("");
  const [searchRows, setSearchRows] = useState<SearchRow[]>([]);
  const [selectedResultIdsByRow, setSelectedResultIdsByRow] = useState<Record<string, string>>({});
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(true);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [finalAudioUrl, setFinalAudioUrl] = useState("");
  const [finalAudioDuration, setFinalAudioDuration] = useState(0);
  const [finalAudioError, setFinalAudioError] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "agent",
      text: "Ready.",
    },
  ]);
  const [isAgentResponding, setIsAgentResponding] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<TimelineTrack>("visuals");
  const hasProcessedRef = useRef(false);

  const prompts = useMemo(() => {
    if (!queryText.trim()) {
      return [];
    }

    try {
      return parseVisualBrollPrompts(queryText);
    } catch {
      return [];
    }
  }, [queryText]);

  const selectedClips = useMemo(() => {
    return searchRows.flatMap((row) => {
      const selectedResultId = selectedResultIdsByRow[row.id];
      const selectedResult =
        row.results.find((result) => getSearchResultId(result) === selectedResultId) ??
        row.results[0];

      return selectedResult ? [selectedResult] : [];
    });
  }, [searchRows, selectedResultIdsByRow]);

  const selectedTrackStatus = useMemo(() => {
    if (selectedTrack === "visuals") {
      return `${selectedClips.length} clip${selectedClips.length === 1 ? "" : "s"}`;
    }

    if (selectedTrack === "tts") {
      return finalAudioUrl ? formatTime(finalAudioDuration) : "empty";
    }

    return "empty";
  }, [finalAudioDuration, finalAudioUrl, selectedClips.length, selectedTrack]);

  const addChatMessage = async () => {
    const message = chatDraft.trim();

    if (!message || isAgentResponding) {
      return;
    }

    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", text: message }];

    setChatMessages(nextMessages);
    setChatDraft("");
    setIsAgentResponding(true);

    try {
      const response = await fetch("/api/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          query_id: queryId,
          query_text: queryText,
          selected_clip_count: selectedClips.length,
          messages: nextMessages,
        }),
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(error?.error ?? "Agent request failed");
      }

      const data = (await response.json()) as { message?: string };
      setChatMessages((currentMessages) => [
        ...currentMessages,
        { role: "agent", text: data.message ?? "I got that." },
      ]);
    } catch (error) {
      setChatMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "agent",
          text: error instanceof Error ? error.message : "Agent request failed",
        },
      ]);
    } finally {
      setIsAgentResponding(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadQuery = async () => {
      const response = await fetch(`/api/queries/${queryId}`);

      if (!response.ok) {
        throw new Error("Failed to load query");
      }

      const data = (await response.json()) as { query: QueryRow };

      if (!isMounted) {
        return;
      }

      setQuery(data.query);
      setQueryText(data.query.query_text);
      setFinalAudioUrl(getAudioStreamUrl(data.query.audio_url));

      if (Array.isArray(data.query.broll_jsonb)) {
        const nextRows = toSearchRows(data.query.broll_jsonb as BatchSearchResponse["rows"]);
        setSearchRows(nextRows);
        setSelectedResultIdsByRow(
          Object.fromEntries(
            nextRows
              .filter((row) => row.results[0])
              .map((row) => [row.id, getSearchResultId(row.results[0])]),
          ),
        );
        setIsSearching(false);
      }
    };

    void loadQuery().catch((error) => {
      if (isMounted) {
        setSearchError(error instanceof Error ? error.message : "Failed to load query");
        setIsSearching(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [queryId]);

  useEffect(() => {
    if (!query || hasProcessedRef.current) {
      return;
    }

    hasProcessedRef.current = true;

    const runQuery = async () => {
      const parsedPrompts = parseVisualBrollPrompts(query.query_text);
      const transcript = parsedPrompts
        .map((prompt) => prompt.transcript)
        .filter((line): line is string => Boolean(line))
        .join("\n\n");

      const searchPromise = Array.isArray(query.broll_jsonb)
        ? Promise.resolve({ rows: query.broll_jsonb as BatchSearchResponse["rows"] })
        : fetch(`${INDEX_API_BASE_URL}/search/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer_id: "gruns",
              items: parsedPrompts.map((prompt) => ({ visual_broll: prompt.visual_broll })),
              results: 5,
              save_top: 5,
              trim: true,
              force_trim_low_confidence: true,
              backend: "gemini",
            }),
          }).then(async (response) => {
            if (!response.ok) {
              const error = (await response.json().catch(() => null)) as { error?: string } | null;
              throw new Error(error?.error ?? "Batch search failed");
            }

            return (await response.json()) as BatchSearchResponse;
          });

      const audioPromise =
        query.audio_url || !transcript
          ? Promise.resolve(null)
          : fetch("/api/query-audio", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query_id: query.query_id, transcript }),
            }).then(async (response) => {
              if (!response.ok) {
                const error = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(error?.error ?? "Final audio generation failed");
              }

              return (await response.json()) as { audio_url: string; stream_url: string };
            });

      setIsSearching(true);
      setIsGeneratingAudio(Boolean(transcript && !query.audio_url));

      const [searchResult, audioResult] = await Promise.allSettled([searchPromise, audioPromise]);

      if (searchResult.status === "fulfilled") {
        const rows = searchResult.value.rows;
        const nextRows = toSearchRows(rows);
        setSearchRows(nextRows);
        setSelectedResultIdsByRow(
          Object.fromEntries(
            nextRows
              .filter((row) => row.results[0])
              .map((row) => [row.id, getSearchResultId(row.results[0])]),
          ),
        );

        if (!Array.isArray(query.broll_jsonb)) {
          await fetch(`/api/queries/${query.query_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ broll_jsonb: rows }),
          });
        }
      } else {
        setSearchError(
          searchResult.reason instanceof Error ? searchResult.reason.message : "Batch search failed",
        );
      }

      if (audioResult.status === "fulfilled" && audioResult.value) {
        setFinalAudioUrl(audioResult.value.stream_url);
      } else if (audioResult.status === "rejected") {
        setFinalAudioError(
          audioResult.reason instanceof Error
            ? audioResult.reason.message
            : "Final audio generation failed",
        );
      }

      setIsSearching(false);
      setIsGeneratingAudio(false);
    };

    void runQuery().catch((error) => {
      setSearchError(error instanceof Error ? error.message : "Failed to run query");
      setIsSearching(false);
      setIsGeneratingAudio(false);
    });
  }, [query]);

  return (
    <main className="relative grid h-full min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] overflow-hidden bg-[#f7f6f2] text-neutral-950">
      <div className="border-t border-neutral-200" />
      <header className="flex h-11 items-center justify-between px-6 font-playfair">
        <nav className="flex min-w-0 items-center gap-2 text-sm font-semibold text-neutral-500">
          <Link className="text-neutral-950 underline-offset-4 hover:underline" href="/create">
            Create
          </Link>
          <ChevronRight className="size-4 shrink-0" />
          <span className="truncate">{queryId.slice(0, 6)}</span>
        </nav>
        <div className="flex items-center gap-2 text-neutral-400" />
      </header>
      <div className="border-t border-neutral-200" />

      <div className="grid min-h-0 grid-cols-[minmax(280px,0.8fr)_minmax(360px,1fr)_minmax(260px,0.65fr)] overflow-hidden max-[1100px]:grid-cols-1">
        <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] border-r border-neutral-200 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                {selectedTrack === "captions" ? <Captions className="size-4" /> : null}
                {selectedTrack === "visuals" ? <Video className="size-4" /> : null}
                {selectedTrack === "tts" ? <Volume2 className="size-4" /> : null}
                {selectedTrack === "music" ? <Music className="size-4" /> : null}
                {selectedTrack}
              </div>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-500">
                {selectedTrackStatus}
              </span>
            </div>

            <div className="min-h-0 overflow-y-auto py-5">
              <div className="grid gap-3">
                {chatMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={
                      message.role === "user"
                        ? "ml-10 rounded-[1.35rem] rounded-br-md bg-[#0b84ff] px-4 py-2.5 text-sm font-medium leading-6 text-white"
                        : "mr-10 rounded-[1.35rem] rounded-bl-md bg-neutral-200 px-4 py-2.5 text-sm font-medium leading-6 text-neutral-900"
                    }
                  >
                    {message.text}
                  </div>
                ))}

                <div className="mr-10 rounded-[1.35rem] rounded-bl-md bg-emerald-100 px-4 py-2.5 text-sm font-medium leading-6 text-emerald-950">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                    {isSearching || isGeneratingAudio ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Bot className="size-3.5" />
                    )}
                  </div>
                  {searchError || finalAudioError
                    ? searchError || finalAudioError
                    : isSearching
                      ? `Searching ${prompts.length || 1} prompt${prompts.length === 1 ? "" : "s"} for b-roll matches.`
                      : isGeneratingAudio
                        ? "Generating the ElevenLabs voiceover."
                        : `${selectedClips.length} clip${selectedClips.length === 1 ? "" : "s"} selected for the current cut.`}
                </div>
                {isAgentResponding ? (
                  <div className="mr-10 flex w-fit items-center gap-2 rounded-full bg-neutral-200 px-3 py-2 text-xs font-bold text-neutral-500">
                    <Loader2 className="size-3.5 animate-spin" />
                    Thinking
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-end gap-2 rounded-[1.5rem] border border-neutral-200 bg-white p-2 shadow-sm">
              <textarea
                className="max-h-24 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm leading-5 outline-none placeholder:text-neutral-400"
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void addChatMessage();
                  }
                }}
                placeholder="Message agent..."
              />
              <button
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white disabled:opacity-35"
                type="button"
                disabled={!chatDraft.trim() || isAgentResponding}
                onClick={() => void addChatMessage()}
                aria-label="Send message"
              >
                {isAgentResponding ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-5" />
                )}
              </button>
            </div>
        </aside>

        <section className="min-h-0 overflow-y-auto px-6 py-6">
          <div className="grid justify-items-center gap-8">
            <FinalVideo
              clips={selectedClips}
              apiBaseUrl={INDEX_API_BASE_URL}
              expectedClipCount={searchRows.length || prompts.length}
              audioUrl={finalAudioUrl}
              showDetails={false}
              showHeader={false}
            />
            {finalAudioUrl ? (
              <audio
                className="hidden"
                src={finalAudioUrl}
                preload="metadata"
                onLoadedMetadata={(event) => setFinalAudioDuration(event.currentTarget.duration)}
              />
            ) : null}
            <StudioTimeline
              clips={selectedClips}
              audioUrl={finalAudioUrl}
              audioDuration={finalAudioDuration}
              selectedTrack={selectedTrack}
              onSelectTrack={setSelectedTrack}
            />
          </div>
        </section>

        <aside className="min-h-0 overflow-y-auto border-l border-neutral-200 px-5 py-6 pb-32">
          <div className="rounded-3xl border border-dashed border-neutral-200 bg-white/50 p-5 font-playfair text-sm font-semibold text-neutral-400">
            Controls coming later
          </div>
        </aside>
      </div>
    </main>
  );
};
