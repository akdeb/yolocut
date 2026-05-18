"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { FinalAudio } from "./FinalAudio";
import { FinalVideo } from "./FinalVideo";
import { Query } from "./Query";
import {
  Search,
  getSearchResultId,
  resolveSourceUrl,
  type SearchClipResult,
  type SearchRow,
} from "./Search";
import { Button } from "../../src/components/ui/button";

type BrollClip = {
  id: string;
  name: string;
  filename: string;
  relativePath: string;
  path: string;
  url: string;
  size: string;
  modifiedAt: string;
  indexed: boolean;
  status: "pending" | "indexing" | "indexed" | "failed";
};

type VideosResponse = {
  directory: string;
  count: number;
  indexed_count: number;
  unindexed_count: number;
  fully_indexed: boolean;
  videos: Array<{
    name: string;
    filename: string;
    relative_path: string;
    path: string;
    url: string;
    indexed: boolean;
    size_bytes: number;
    modified_at: string;
  }>;
};

type IndexJobStatus = {
  job_id?: string;
  status?: string;
  progress?: number;
  current_file?: string;
  files_done?: number;
  total_files?: number;
  current_chunk?: number;
  total_chunks_in_file?: number;
  done?: boolean;
  succeeded?: boolean;
  failed?: boolean;
  error?: string;
};

type VisualBrollPrompt = {
  visual_broll: string;
  transcript?: string;
};

type BatchSearchResponse = {
  rows: Array<{
    index: number;
    visual_broll: string;
    query?: string;
    results: SearchClipResult[];
  }>;
};

const INDEX_API_BASE_URL = "http://127.0.0.1:8080";
const MAX_BRIEF_ITEMS = 50;
const MAX_VISUAL_BROLL_LENGTH = 1000;
const MAX_TRANSCRIPT_LENGTH = 2000;

const formatBytes = (bytes: number) => {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const sleep = (milliseconds: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

const getJobState = (payload: Record<string, unknown>) => {
  return String(payload.status ?? payload.state ?? "").toLowerCase();
};

const isFinishedJob = (payload: Record<string, unknown>) => {
  const state = getJobState(payload);
  return (
    payload.done === true ||
    payload.finished === true ||
    ["complete", "completed", "done", "finished", "success", "succeeded"].includes(state)
  );
};

const isFailedJob = (payload: Record<string, unknown>) => {
  return ["canceled", "cancelled", "error", "failed"].includes(getJobState(payload));
};

const getProgressPercent = (progress: number | undefined) => {
  if (typeof progress !== "number") {
    return null;
  }

  const normalizedProgress = progress > 1 ? progress : progress * 100;
  return Math.max(0, Math.min(100, Math.round(normalizedProgress)));
};

const parseVisualBrollPrompts = (value: string): VisualBrollPrompt[] => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Brief must be valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Brief must be a JSON array of visual_broll objects.");
  }

  if (parsed.length > MAX_BRIEF_ITEMS) {
    throw new Error(`Brief can include at most ${MAX_BRIEF_ITEMS} items.`);
  }

  const prompts = parsed.map((item, index) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("visual_broll" in item) ||
      typeof item.visual_broll !== "string" ||
      item.visual_broll.trim().length === 0
    ) {
      throw new Error(`Brief item ${index + 1} must include a visual_broll string.`);
    }

    const visualBroll = item.visual_broll.trim();

    if (visualBroll.length > MAX_VISUAL_BROLL_LENGTH) {
      throw new Error(
        `Brief item ${index + 1} visual_broll must be ${MAX_VISUAL_BROLL_LENGTH} characters or fewer.`,
      );
    }

    const transcript =
      "transcript" in item && typeof item.transcript === "string" ? item.transcript.trim() : "";

    if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
      throw new Error(
        `Brief item ${index + 1} transcript must be ${MAX_TRANSCRIPT_LENGTH} characters or fewer.`,
      );
    }

    return transcript ? { visual_broll: visualBroll, transcript } : { visual_broll: visualBroll };
  });

  if (prompts.length === 0) {
    throw new Error("Brief must include at least one visual_broll item.");
  }

  return prompts;
};

const YolocutPage = () => {
  const [brief, setBrief] = useState("");
  const [clips, setClips] = useState<BrollClip[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexMessage, setIndexMessage] = useState("");
  const [jobStatus, setJobStatus] = useState<IndexJobStatus | null>(null);
  const [searchRows, setSearchRows] = useState<SearchRow[]>([]);
  const [selectedResultIdsByRow, setSelectedResultIdsByRow] = useState<Record<string, string>>({});
  const [searchPromptCount, setSearchPromptCount] = useState(0);
  const [searchError, setSearchError] = useState("");
  const [finalAudioUrl, setFinalAudioUrl] = useState("");
  const [finalAudioDuration, setFinalAudioDuration] = useState(0);
  const [finalAudioError, setFinalAudioError] = useState("");
  const [editError, setEditError] = useState("");
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isOpeningEditor, setIsOpeningEditor] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const jobProgressPercent = getProgressPercent(jobStatus?.progress);

  const indexedClipCount = useMemo(() => {
    return clips.filter((clip) => clip.indexed).length;
  }, [clips]);

  const selectedClips = useMemo(() => {
    return searchRows.flatMap((row) => {
      const selectedResultId = selectedResultIdsByRow[row.id];
      const selectedResult =
        row.results.find((result) => getSearchResultId(result) === selectedResultId) ??
        row.results[0];

      return selectedResult ? [selectedResult] : [];
    });
  }, [searchRows, selectedResultIdsByRow]);

  const canCreate = useMemo(() => {
    return brief.trim().length > 0 && indexedClipCount > 1 && !isCreating && !isIndexing;
  }, [brief, indexedClipCount, isCreating, isIndexing]);

  const canIndex = clips.length > 0 && !isIndexing && !isLoadingVideos;

  const loadVideos = async () => {
    setIsLoadingVideos(true);
    setIndexMessage("Loading b-roll from FastAPI...");

    try {
      const response = await fetch(`${INDEX_API_BASE_URL}/videos`);

      if (!response.ok) {
        throw new Error("Failed to load videos");
      }

      const data = (await response.json()) as VideosResponse;
      const nextClips = data.videos.map((video) => {
        return {
          id: video.path,
          name: video.name,
          filename: video.filename,
          relativePath: video.relative_path,
          path: video.path,
          url: video.url,
          size: formatBytes(video.size_bytes),
          modifiedAt: video.modified_at,
          indexed: video.indexed,
          status: video.indexed ? ("indexed" as const) : ("pending" as const),
        };
      });

      setClips(nextClips);
      setIndexMessage(
        data.count > 0
          ? `${data.count} b-roll clip${data.count === 1 ? "" : "s"} loaded. ${data.indexed_count} indexed, ${data.unindexed_count} pending.`
          : "No b-roll clips found in the backend video directory.",
      );
    } catch (error) {
      setClips([]);
      setIndexMessage(error instanceof Error ? error.message : "Failed to load videos");
    } finally {
      setIsLoadingVideos(false);
    }
  };

  useEffect(() => {
    void loadVideos();
  }, []);

  useEffect(() => {
    return () => {
      if (finalAudioUrl) {
        URL.revokeObjectURL(finalAudioUrl);
      }
    };
  }, [finalAudioUrl]);

  const applyJobStatus = (status: IndexJobStatus) => {
    const progressPercent = getProgressPercent(status.progress);
    const progress = progressPercent === null ? "" : ` ${progressPercent}%`;
    const state = status.status ?? "running";

    setJobStatus(status);
    setIndexMessage(`Indexing ${state}${progress}...`);
  };

  const pollJobUntilComplete = async (jobId: string) => {
    for (;;) {
      await sleep(1000);

      const statusResponse = await fetch(`${INDEX_API_BASE_URL}/jobs/${jobId}`);

      if (!statusResponse.ok) {
        throw new Error("Failed to read indexing status");
      }

      const status = (await statusResponse.json()) as IndexJobStatus;
      applyJobStatus(status);

      if (status.failed || isFailedJob(status as Record<string, unknown>)) {
        throw new Error(status.error ?? "Indexing job failed");
      }

      if (status.done || isFinishedJob(status as Record<string, unknown>)) {
        return;
      }
    }
  };

  const streamJobUntilComplete = (jobId: string) => {
    return new Promise<void>((resolve, reject) => {
      if (typeof EventSource === "undefined") {
        void pollJobUntilComplete(jobId).then(resolve, reject);
        return;
      }

      let settled = false;
      const source = new EventSource(`${INDEX_API_BASE_URL}/jobs/${jobId}/events`);

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        source.close();
        callback();
      };

      const parseStatus = (event: MessageEvent) => {
        return JSON.parse(event.data as string) as IndexJobStatus;
      };

      source.addEventListener("progress", (event) => {
        try {
          applyJobStatus(parseStatus(event as MessageEvent));
        } catch (error) {
          finish(() => reject(error instanceof Error ? error : new Error("Invalid job event")));
        }
      });

      source.addEventListener("complete", (event) => {
        try {
          const status = parseStatus(event as MessageEvent);
          applyJobStatus(status);

          finish(() => {
            if (status.failed) {
              reject(new Error(status.error ?? "Indexing job failed"));
              return;
            }

            resolve();
          });
        } catch (error) {
          finish(() => reject(error instanceof Error ? error : new Error("Invalid job event")));
        }
      });

      source.onerror = () => {
        if (settled) {
          return;
        }

        settled = true;
        source.close();
        setIndexMessage("Progress stream dropped. Falling back to polling...");
        void pollJobUntilComplete(jobId).then(resolve, reject);
      };
    });
  };

  const handleIndex = async () => {
    if (!canIndex) {
      return;
    }

    setIsIndexing(true);
    setIndexMessage("Starting index job...");
    setJobStatus({ status: "queued", progress: 0 });
    setClips((currentClips) =>
      currentClips.map((clip) => ({
        ...clip,
        status: clip.indexed ? clip.status : "indexing",
      })),
    );

    try {
      const jobResponse = await fetch(`${INDEX_API_BASE_URL}/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunk_duration: 2,
          overlap: 1,
          backend: "gemini",
        }),
      });

      if (!jobResponse.ok) {
        throw new Error("Failed to start indexing");
      }

      const job = (await jobResponse.json()) as { job_id?: string };

      if (!job.job_id) {
        throw new Error("Indexer did not return a job_id");
      }

      setJobStatus({ job_id: job.job_id, status: "queued", progress: 0 });
      setIndexMessage(`Indexing job ${job.job_id} is running...`);
      await streamJobUntilComplete(job.job_id);

      await loadVideos();
      setJobStatus((currentStatus) => ({
        ...currentStatus,
        status: "succeeded",
        progress: 1,
        done: true,
        succeeded: true,
      }));
      setIndexMessage("Index complete. Indexed b-roll is ready for creation.");
    } catch (error) {
      setJobStatus((currentStatus) => ({
        ...currentStatus,
        status: "failed",
        done: true,
        failed: true,
        error: error instanceof Error ? error.message : "Indexing failed",
      }));
      setClips((currentClips) =>
        currentClips.map((clip) => ({
          ...clip,
          status: clip.indexed ? "indexed" : "failed",
        })),
      );
      setIndexMessage(error instanceof Error ? error.message : "Indexing failed");
    } finally {
      setIsIndexing(false);
    }
  };

  const handleCreate = async () => {
    if (!canCreate) {
      return;
    }

    setIsCreating(true);
    setIsGeneratingAudio(true);
    setSearchError("");
    setFinalAudioError("");
    if (finalAudioUrl) {
      URL.revokeObjectURL(finalAudioUrl);
      setFinalAudioUrl("");
    }
    setFinalAudioDuration(0);
    try {
      const prompts = parseVisualBrollPrompts(brief);
      setSearchPromptCount(prompts.length);

      const searchRequest = fetch(`${INDEX_API_BASE_URL}/search/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: prompts.map((prompt) => ({ visual_broll: prompt.visual_broll })),
          results: 5,
          save_top: 5,
          trim: true,
          force_trim_low_confidence: true,
          backend: "gemini",
        }),
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error("Batch search failed");
        }

        return (await response.json()) as BatchSearchResponse;
      });

      const transcript = prompts
        .map((prompt) => prompt.transcript)
        .filter((line): line is string => Boolean(line))
        .join("\n\n");
      const audioRequest = transcript
        ? fetch("/api/final-audio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript }),
          }).then(async (response) => {
            if (!response.ok) {
              const error = (await response.json().catch(() => null)) as { error?: string } | null;
              throw new Error(error?.error ?? "Final audio generation failed");
            }

            return URL.createObjectURL(await response.blob());
          })
        : Promise.reject(new Error("No transcript text found for final audio."));

      const [searchResult, audioResult] = await Promise.allSettled([searchRequest, audioRequest]);

      if (audioResult.status === "fulfilled") {
        setFinalAudioUrl(audioResult.value);
      } else {
        setFinalAudioError(audioResult.reason instanceof Error ? audioResult.reason.message : "Final audio generation failed");
      }

      if (searchResult.status === "rejected") {
        throw searchResult.reason;
      }

      const data = searchResult.value;
      const nextRows = data.rows.map((row) => ({
        id: `${row.index}-${row.visual_broll}`,
        query: row.query ?? row.visual_broll,
        results: row.results.slice(0, 5),
      }));
      const nextSelectedResultIdsByRow = Object.fromEntries(
        nextRows
          .filter((row) => row.results[0])
          .map((row) => [row.id, getSearchResultId(row.results[0])]),
      );

      setSearchRows(nextRows);
      setSelectedResultIdsByRow(nextSelectedResultIdsByRow);
    } catch (error) {
      setSearchRows([]);
      setSelectedResultIdsByRow({});
      setSearchError(error instanceof Error ? error.message : "Failed to search b-roll");
    } finally {
      setIsCreating(false);
      setIsGeneratingAudio(false);
    }
  };

  const handleEdit = async () => {
    if (!finalAudioUrl || selectedClips.length === 0) {
      return;
    }

    setIsOpeningEditor(true);
    setEditError("");
    try {
      const origin = window.location.origin;
      const response = await fetch("/api/remotion-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioSrc: `${origin}/api/final-audio`,
          audioDurationInSeconds: finalAudioDuration,
          clips: selectedClips.map((clip) => ({
            src: resolveSourceUrl(clip, INDEX_API_BASE_URL),
            name: clip.source_basename,
            startInSeconds: clip.start_time,
            endInSeconds: clip.end_time,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to prepare Remotion edit");
      }

      const data = (await response.json()) as { studioUrl?: string };
      window.open(
        data.studioUrl ?? `http://127.0.0.1:3002/CaptionedVideo?edit=${Date.now()}`,
        "yolocut-remotion-studio",
      );
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to open Remotion editor");
    } finally {
      setIsOpeningEditor(false);
    }
  };

  return (
    <main className="grid h-dvh min-h-0 grid-cols-[minmax(360px,1.3fr)_minmax(0,2fr)_minmax(340px,1fr)] overflow-hidden bg-[#f7f6f2] text-neutral-950 max-[1100px]:grid-cols-1 max-[1100px]:grid-rows-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <Query
        brief={brief}
        clips={clips}
        canCreate={canCreate}
        canIndex={canIndex}
        isCreating={isCreating}
        isIndexing={isIndexing}
        isLoadingVideos={isLoadingVideos}
        indexMessage={indexMessage}
        jobStatus={jobStatus}
        jobProgressPercent={jobProgressPercent}
        apiBaseUrl={INDEX_API_BASE_URL}
        onBriefChange={setBrief}
        onCreate={handleCreate}
        onIndex={handleIndex}
        onRefreshVideos={() => void loadVideos()}
      />

      <section className="min-h-0 overflow-hidden bg-[#f7f6f2]">
        <Search
          rows={searchRows}
          isSearching={isCreating}
          error={searchError}
          apiBaseUrl={INDEX_API_BASE_URL}
          searchPromptCount={searchPromptCount}
          selectedResultIdsByRow={selectedResultIdsByRow}
          onSelectResult={(rowId, result) =>
            setSelectedResultIdsByRow((currentSelections) => ({
              ...currentSelections,
              [rowId]: getSearchResultId(result),
            }))
          }
        />
      </section>
      <aside className="min-h-0 overflow-y-auto border-l border-neutral-200 bg-white/80 px-5 py-8">
        <div className="grid gap-8">
          <div className="flex items-center justify-end">
            <Button
              disabled={!finalAudioUrl || selectedClips.length === 0 || isOpeningEditor}
              onClick={handleEdit}
            >
              <ExternalLink className="mr-2 size-4" />
              {isOpeningEditor ? "Opening..." : "Edit"}
            </Button>
          </div>
          {editError ? (
            <p className="m-0 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {editError}
            </p>
          ) : null}
          <FinalAudio
            audioUrl={finalAudioUrl}
            isGenerating={isGeneratingAudio}
            error={finalAudioError}
            onDurationChange={setFinalAudioDuration}
          />
          <FinalVideo
            clips={selectedClips}
            apiBaseUrl={INDEX_API_BASE_URL}
            expectedClipCount={searchRows.length || searchPromptCount}
            audioUrl={finalAudioUrl}
          />
        </div>
      </aside>
    </main>
  );
};

export default YolocutPage;
