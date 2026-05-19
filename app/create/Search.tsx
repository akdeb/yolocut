/* eslint-disable @remotion/warn-native-media-tag */

import { Film, Loader2, SearchIcon, Sparkles } from "lucide-react";
import { Card } from "../../src/components/ui/card";

export type SearchClipResult = {
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

export type SearchRow = {
  id: string;
  query: string;
  results: SearchClipResult[];
};

type SearchProps = {
  rows: SearchRow[];
  isSearching: boolean;
  error: string;
  apiBaseUrl: string;
  searchPromptCount: number;
  selectedResultIdsByRow: Record<string, string>;
  onSelectResult: (rowId: string, result: SearchClipResult) => void;
};

const resolveApiUrl = (url: string, apiBaseUrl: string) => {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsedUrl = new URL(url);

      if (parsedUrl.hostname.endsWith(".blob.vercel-storage.com")) {
        return `/api/broll-video?pathname=${encodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""))}`;
      }
    } catch {
      return url;
    }

    return url;
  }

  if (url.startsWith("/api/")) {
    return url;
  }

  return `${apiBaseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
};

export const getSearchResultId = (result: SearchClipResult) => {
  return `${result.source_file}:${result.start_time}:${result.end_time}:${result.rank}`;
};

export const resolveSourceUrl = (result: SearchClipResult, apiBaseUrl: string) => {
  if (result.clip_stream_url) {
    return resolveApiUrl(result.clip_stream_url, apiBaseUrl);
  }

  if (result.clip_url) {
    return resolveApiUrl(result.clip_url, apiBaseUrl);
  }

  if (!result.source_file) {
    return null;
  }

  return resolveApiUrl(`/clips?path=${encodeURIComponent(result.source_file)}`, apiBaseUrl);
};

export const resolveSourceRangeUrl = (result: SearchClipResult, apiBaseUrl: string) => {
  const sourceUrl = resolveSourceUrl(result, apiBaseUrl);

  if (!sourceUrl) {
    return null;
  }

  const start = Math.max(0, result.start_time);
  const end = Math.max(start, result.end_time);

  return `${sourceUrl}#t=${start},${end}`;
};

export const Search = ({
  rows,
  isSearching,
  error,
  apiBaseUrl,
  searchPromptCount,
  selectedResultIdsByRow,
  onSelectResult,
}: SearchProps) => {
  if (isSearching) {
    const skeletonRows = Array.from({ length: Math.max(searchPromptCount, 1) });

    return (
      <div className="h-full min-h-0 overflow-y-auto overscroll-contain px-8 py-8">
        <div className="grid gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-emerald-500">
              <Loader2 className="size-4 animate-spin" />
              <span>Searching</span>
            </div>
            <h2 className="m-0 mt-2 font-serif text-3xl font-bold tracking-[-0.035em] text-neutral-950">
              Fetching b-roll matches
            </h2>
            <p className="m-0 mt-2 text-sm text-neutral-500">
              Searching {searchPromptCount || 1} prompt{searchPromptCount === 1 ? "" : "s"} and
              preparing the top 5 candidates for each.
            </p>
          </div>

          <div className="grid gap-5">
            {skeletonRows.map((_, rowIndex) => (
              <Card key={rowIndex} className="overflow-hidden">
                <div className="border-b border-neutral-100 px-5 py-4">
                  <div className="h-3 w-24 rounded-full bg-neutral-200" />
                  <div className="mt-3 h-5 w-3/4 rounded-full bg-neutral-200" />
                </div>
                <div className="flex gap-4 overflow-x-auto overscroll-x-contain p-4 pb-5">
                  {Array.from({ length: 5 }).map((__, resultIndex) => (
                    <div
                      key={resultIndex}
                      className="w-[280px] shrink-0 overflow-hidden rounded-2xl border border-neutral-100 bg-white"
                    >
                      <div className="aspect-video bg-neutral-200" />
                      <div className="grid gap-2 p-3">
                        <div className="h-4 w-16 rounded-full bg-neutral-100" />
                        <div className="h-4 w-full rounded-full bg-neutral-100" />
                        <div className="h-3 w-20 rounded-full bg-neutral-100" />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-10 py-8">
        <Card className="max-w-md border-red-100 bg-red-50 p-6 text-red-800">
          <p className="m-0 text-sm font-semibold">{error}</p>
        </Card>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-10 py-8">
        <div className="max-w-lg text-center">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-emerald-500">
            <SearchIcon className="size-4" />
            <span>Search results</span>
          </div>
          <h2 className="m-0 mt-2 font-serif text-3xl font-bold tracking-[-0.035em] text-neutral-950">
            Add visual_broll prompts and create
          </h2>
          <p className="m-0 mt-3 text-sm leading-6 text-neutral-500">
            The right side will show one row per prompt, with the top 5 matching clips in each row.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain px-8 py-8">
      <div className="grid gap-6">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-[0.22em] text-emerald-500">
            Search results
          </p>
          <h2 className="m-0 mt-2 font-serif text-3xl font-bold tracking-[-0.035em] text-neutral-950">
            Top b-roll matches
          </h2>
        </div>

        <div className="grid gap-5">
          {rows.map((row, rowIndex) => (
            <Card key={row.id} className="overflow-hidden">
              <div className="border-b border-neutral-100 px-5 py-4">
                <p className="m-0 text-xs font-bold uppercase tracking-[0.18em] text-neutral-400">
                  Prompt {rowIndex + 1}
                </p>
                <h3 className="m-0 mt-1 text-base font-semibold text-neutral-950">{row.query}</h3>
              </div>

              <div className="flex gap-4 overflow-x-auto overscroll-x-contain p-4 pb-5">
                {row.results.map((result) => {
                  const clipUrl = resolveSourceRangeUrl(result, apiBaseUrl);
                  const resultId = getSearchResultId(result);
                  const isSelected = selectedResultIdsByRow[row.id] === resultId;

                  return (
                    <div
                      key={`${row.id}-${result.rank}`}
                      className={
                        isSelected
                          ? "w-[300px] shrink-0 overflow-hidden rounded-2xl border border-emerald-300 bg-white shadow-sm ring-4 ring-emerald-100"
                          : "w-[300px] shrink-0 overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-sm hover:border-neutral-200"
                      }
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectResult(row.id, result)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectResult(row.id, result);
                        }
                      }}
                    >
                      <div className="relative aspect-video bg-neutral-950">
                        {clipUrl ? (
                          <video
                            className="size-full object-cover"
                            src={clipUrl}
                            preload="metadata"
                            controls
                            muted
                            playsInline
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center px-4 text-center text-xs font-medium text-white/70">
                            <Film className="mr-2 size-4" />
                            No clip preview
                          </div>
                        )}
                        {isSelected ? (
                          <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                          <svg
                            aria-hidden="true"
                            className="size-3"
                            viewBox="0 0 16 16"
                            fill="none"
                          >
                            <path
                              d="M13.5 4.5 6.5 11.5 2.5 7.5"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                            />
                          </svg>
                        </span>
                        ) : null}
                      </div>
                      <div className="grid gap-1.5 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
                            #{result.rank}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isSelected ? (
                              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                <Sparkles className="size-3" />
                                selected
                              </span>
                            ) : null}
                            <span className="text-xs font-medium text-emerald-700">
                              {(result.similarity_score * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-neutral-950">
                          {result.source_basename}
                        </strong>
                        <span className="text-xs text-neutral-500">
                          {result.start_time_formatted} - {result.end_time_formatted}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
