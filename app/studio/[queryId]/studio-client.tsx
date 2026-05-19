"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronRight } from "lucide-react";
import { Button } from "../../../src/components/ui/button";
import { FinalAudio } from "../../create/FinalAudio";
import { FinalVideo } from "../../create/FinalVideo";
import {
  Search,
  getSearchResultId,
  type SearchClipResult,
  type SearchRow,
} from "../../create/Search";

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

type StudioClientProps = {
  queryId: string;
};

const DEFAULT_INDEX_API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://yolocut-server.vercel.app"
    : "http://127.0.0.1:8080";
const INDEX_API_BASE_URL =
  process.env.NEXT_PUBLIC_YOLOCUT_SERVER_URL ?? DEFAULT_INDEX_API_BASE_URL;

const parseVisualBrollPrompts = (value: string): VisualBrollPrompt[] => {
  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Query must be a JSON array.");
  }

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

const getShortQueryText = (queryText: string) => {
  const compact = queryText.replace(/\s+/g, " ").trim();
  return compact.length > 72 ? `${compact.slice(0, 72)}...` : compact;
};

export const StudioClient = ({ queryId }: StudioClientProps) => {
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
    <main className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[#f7f6f2] text-neutral-950">
      <header className="flex h-14 items-center border-b border-neutral-200 bg-white/80 px-6">
        <nav className="flex min-w-0 items-center gap-2 text-sm font-semibold text-neutral-500">
          <Link className="text-neutral-950 hover:underline" href="/create">
            Create
          </Link>
          <ChevronRight className="size-4 shrink-0" />
          <span className="truncate">{getShortQueryText(queryText || queryId)}</span>
        </nav>
      </header>

      <div className="grid min-h-0 grid-cols-[minmax(0,1.6fr)_minmax(360px,0.8fr)] overflow-hidden max-[1000px]:grid-cols-1">
        <section className="min-h-0 overflow-hidden border-r border-neutral-200">
          <Search
            rows={searchRows}
            isSearching={isSearching}
            error={searchError}
            apiBaseUrl={INDEX_API_BASE_URL}
            searchPromptCount={prompts.length}
            selectedResultIdsByRow={selectedResultIdsByRow}
            onSelectResult={(rowId, result) =>
              setSelectedResultIdsByRow((currentSelections) => ({
                ...currentSelections,
                [rowId]: getSearchResultId(result),
              }))
            }
          />
        </section>

        <aside className="min-h-0 overflow-y-auto bg-white/80 px-5 py-8">
          <div className="grid gap-8">
            <FinalAudio
              audioUrl={finalAudioUrl}
              isGenerating={isGeneratingAudio}
              error={finalAudioError}
              onDurationChange={setFinalAudioDuration}
            />
            <FinalVideo
              clips={selectedClips}
              apiBaseUrl={INDEX_API_BASE_URL}
              expectedClipCount={searchRows.length || prompts.length}
              audioUrl={finalAudioUrl}
            />
            {finalAudioDuration > 0 ? (
              <p className="m-0 text-xs font-medium text-neutral-500">
                Final audio duration: {finalAudioDuration.toFixed(1)}s
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      <div className="border-t border-neutral-200 bg-[#f7f6f2]/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-end gap-3 rounded-[2rem] border border-neutral-200 bg-white p-3 shadow-sm">
          <textarea
            className="max-h-24 min-h-11 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm leading-6 text-neutral-950 outline-none"
            readOnly
            value={queryText}
          />
          <Button className="size-11 rounded-full px-0" disabled>
            <ArrowUp className="size-5" />
          </Button>
        </div>
      </div>
    </main>
  );
};
