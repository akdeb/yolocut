"use client";

/* eslint-disable @remotion/non-pure-animation */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Clock3, FileAudio, Film, Loader2 } from "lucide-react";

type QueryRow = {
  query_id: string;
  created_at: string;
  query_text: string;
  broll_jsonb: unknown;
  audio_url: string | null;
  music_url: string | null;
  captions_url: string | null;
};

const getQueryPreview = (queryText: string) => {
  const compact = queryText.replace(/\s+/g, " ").trim();
  return compact.length > 86 ? `${compact.slice(0, 86)}...` : compact;
};

const getResultCount = (value: unknown) => {
  if (!Array.isArray(value)) {
    return 0;
  }

  return value.reduce((total, row) => {
    if (typeof row !== "object" || row === null || !("results" in row) || !Array.isArray(row.results)) {
      return total;
    }

    return total + row.results.length;
  }, 0);
};

const HistoryPage = () => {
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadQueries = async () => {
      const response = await fetch("/api/queries");

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error ?? "Failed to load history");
      }

      const data = (await response.json()) as { queries: QueryRow[] };

      if (isMounted) {
        setQueries(data.queries);
      }
    };

    void loadQueries()
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load history");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const content = useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex items-center gap-3 rounded-3xl border border-neutral-200 bg-white p-5 text-sm font-semibold text-neutral-500 shadow-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading history...
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-3xl border border-red-100 bg-red-50 p-5 text-sm font-semibold text-red-700">
          {error}
        </div>
      );
    }

    if (queries.length === 0) {
      return (
        <div className="rounded-3xl border border-dashed border-neutral-200 bg-white/70 p-7 text-center font-playfair text-sm font-semibold text-neutral-500">
          No query history yet.
        </div>
      );
    }

    return (
      <div className="grid gap-3">
        {queries.map((query) => {
          const resultCount = getResultCount(query.broll_jsonb);

          return (
            <Link
              key={query.query_id}
              className="grid gap-3 rounded-3xl border border-neutral-200 bg-white p-4 text-neutral-950 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
              href={`/studio/${query.query_id}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-playfair text-sm font-semibold text-neutral-500">
                  {query.query_id.slice(0, 6)}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400">
                  <Clock3 className="size-3.5" />
                  {new Date(query.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="m-0 text-sm font-semibold leading-5 text-neutral-800">
                {getQueryPreview(query.query_text)}
              </p>
              <div className="flex flex-wrap gap-2 text-xs font-bold text-neutral-500">
                <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1">
                  <Film className="size-3.5" />
                  {resultCount} result{resultCount === 1 ? "" : "s"}
                </span>
                {query.audio_url ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                    <FileAudio className="size-3.5" />
                    audio
                  </span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    );
  }, [error, isLoading, queries]);

  return (
    <main className="h-full overflow-y-auto bg-[#f7f6f2] px-5 py-8 text-neutral-950">
      <div className="mx-auto grid w-full max-w-sm gap-6">
        <div>
          <h1 className="m-0 font-playfair text-4xl font-medium tracking-[-0.045em]">
            History
          </h1>
          <p className="m-0 mt-1 font-playfair text-sm font-semibold text-neutral-500">
            Past Yolocut queries
          </p>
        </div>
        {content}
      </div>
    </main>
  );
};

export default HistoryPage;
