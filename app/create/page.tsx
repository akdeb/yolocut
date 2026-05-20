"use client";

/* eslint-disable @remotion/warn-native-media-tag */

import { useEffect, useMemo, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Pencil, Share2, Sparkles } from "lucide-react";
import { type PutBlobResult } from "@vercel/blob";
import { CreateHome } from "./CreateHome";
import { FinalVideo } from "./FinalVideo";
import { UploadToast, type UploadToastState } from "./UploadToast";
import {
  getSearchResultId,
  type SearchClipResult,
  type SearchRow,
} from "./Search";

type BrollClip = {
  id: string;
  name: string;
  filename: string;
  relativePath: string;
  path: string;
  url: string;
  size: string;
  creator: string;
  modifiedAt: string;
  indexed: boolean;
  status: "pending" | "indexing" | "indexed" | "failed";
};

type VideosResponse = {
  directory?: string;
  user_id?: string;
  upload_prefix?: string;
  count: number;
  total_count?: number;
  indexed_count: number;
  unindexed_count: number;
  fully_indexed: boolean;
  videos: Array<{
    name: string;
    filename: string;
    relative_path: string;
    path: string;
    url: string;
    stream_url: string;
    creator?: string;
    indexed: boolean;
    size_bytes: number;
    modified_at: string;
  }>;
};

type IndexJobStatus = {
  job_id?: string;
  status?: string;
  progress?: number;
  current_broll_id?: string;
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

type CreationStatus = "idle" | "clips" | "audio" | "complete" | "error";

const DEFAULT_INDEX_API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://yolocut-server.vercel.app"
    : "http://127.0.0.1:8080";
const INDEX_API_BASE_URL =
  process.env.NEXT_PUBLIC_YOLOCUT_SERVER_URL ?? DEFAULT_INDEX_API_BASE_URL;
const MAX_BRIEF_ITEMS = 50;
const MAX_VISUAL_BROLL_LENGTH = 1000;
const MAX_TRANSCRIPT_LENGTH = 2000;
const INDEX_POLL_INTERVAL_MS = 1000;
const CREATOR_OPTIONS = [
  "alexis anne",
  "alexis reneel",
  "ali cardinal",
  "allison baldwin",
  "amanda hernandez",
  "angela chen",
  "anna panza",
  "annika swanson",
  "ashley rogers",
  "ashley vance",
  "austin gregory",
  "bailey holmquest",
];

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

const sanitizeFilename = (filename: string) => {
  return filename
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
};

const getSizeInMegabytes = (bytes: number) => {
  return Math.max(1, Math.round(bytes / 1024 / 1024));
};

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

const getIndexStatusDescription = (status: IndexJobStatus) => {
  const progressPercent = getProgressPercent(status.progress);
  const state = status.status ?? "running";
  const progress = progressPercent === null ? "" : ` (${progressPercent}% complete)`;
  const fileProgress =
    typeof status.files_done === "number" && typeof status.total_files === "number"
      ? ` ${status.files_done}/${status.total_files} files`
      : "";
  const chunkProgress =
    typeof status.current_chunk === "number" && typeof status.total_chunks_in_file === "number"
      ? `, chunk ${status.current_chunk}/${status.total_chunks_in_file}`
      : "";
  const currentFile = status.current_file ? `: ${status.current_file}` : "";

  return `Index job is ${state}${progress}${fileProgress}${chunkProgress}${currentFile}`;
};

const parseVisualBrollPrompts = (value: string): VisualBrollPrompt[] => {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Brief must be valid JSON.");
  }

  const parsed = Array.isArray(parsedValue) ? parsedValue : [parsedValue];

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
  const [isUploadingVideos, setIsUploadingVideos] = useState(false);
  const [, setIndexMessage] = useState("");
  const [, setJobStatus] = useState<IndexJobStatus | null>(null);
  const [searchRows, setSearchRows] = useState<SearchRow[]>([]);
  const [selectedResultIdsByRow, setSelectedResultIdsByRow] = useState<Record<string, string>>({});
  const [searchError, setSearchError] = useState("");
  const [finalAudioUrl, setFinalAudioUrl] = useState("");
  const [, setFinalAudioDuration] = useState(0);
  const [finalAudioError, setFinalAudioError] = useState("");
  const [, setIsGeneratingAudio] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [creationStatus, setCreationStatus] = useState<CreationStatus>("idle");
  const [createdQueryId, setCreatedQueryId] = useState("");
  const [uploadPrefix, setUploadPrefix] = useState("");
  const [userId, setUserId] = useState("");
  const [creator, setCreator] = useState(CREATOR_OPTIONS[0]);
  const [uploadToast, setUploadToast] = useState<UploadToastState>(null);
  const [totalBrollCount, setTotalBrollCount] = useState(0);
  const [indexedBrollCount, setIndexedBrollCount] = useState(0);
  const [unindexedBrollCount, setUnindexedBrollCount] = useState(0);

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
    return brief.trim().length > 0 && !isCreating;
  }, [brief, isCreating]);

  const canIndex = unindexedBrollCount > 0 && !isIndexing && !isLoadingVideos;
  const shouldShowResultPanel = creationStatus !== "idle" || Boolean(createdQueryId);

  const loadVideos = async () => {
    setIsLoadingVideos(true);
    setIndexMessage("Loading b-roll from Vercel Blob...");

    try {
      const response = await fetch("/api/broll-videos");

      if (!response.ok) {
        throw new Error("Failed to load videos");
      }

      const data = (await response.json()) as VideosResponse;
      setUploadPrefix(data.upload_prefix ?? "");
      setUserId(data.user_id ?? "");
      const nextClips = data.videos.map((video) => {
        return {
          id: video.path,
          name: video.name,
          filename: video.filename,
          relativePath: video.relative_path,
          path: video.path,
          url: video.stream_url,
          size: formatBytes(video.size_bytes),
          creator: video.creator ?? "",
          modifiedAt: video.modified_at,
          indexed: video.indexed,
          status: video.indexed ? ("indexed" as const) : ("pending" as const),
        };
      });

      setClips(nextClips);
      setTotalBrollCount(data.total_count ?? data.count);
      setIndexedBrollCount(data.indexed_count);
      setUnindexedBrollCount(data.unindexed_count);
      setIndexMessage(
        (data.total_count ?? data.count) > 0
          ? `${data.total_count ?? data.count} b-roll clip${(data.total_count ?? data.count) === 1 ? "" : "s"} in Supabase (${data.indexed_count} indexed).`
          : "No b-roll clips found in yolocut-broll yet.",
      );
    } catch (error) {
      setClips([]);
      setTotalBrollCount(0);
      setIndexedBrollCount(0);
      setUnindexedBrollCount(0);
      setIndexMessage(error instanceof Error ? error.message : "Failed to load videos");
    } finally {
      setIsLoadingVideos(false);
    }
  };

  useEffect(() => {
    void loadVideos();
  }, []);

  useEffect(() => {
    const handleGlobalCreate = () => {
      void handleCreate();
    };

    window.addEventListener("yolocut:create", handleGlobalCreate);

    return () => {
      window.removeEventListener("yolocut:create", handleGlobalCreate);
    };
  });

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
    const description = getIndexStatusDescription(status);

    setJobStatus(status);
    setIndexMessage(`Indexing ${state}${progress}...`);
    setUploadToast({
      status: "loading",
      title: "Indexing b-roll",
      description,
    });
  };

  const pollJobUntilComplete = async (jobId: string) => {
    for (;;) {
      await sleep(INDEX_POLL_INTERVAL_MS);

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

    if (!userId) {
      setIndexMessage("Missing user_id. Refresh and try again.");
      setUploadToast({
        status: "error",
        title: "Indexing failed",
        description: "Missing user_id. Refresh and try again.",
      });
      return;
    }

    setIsIndexing(true);
    setIndexMessage("Starting index job...");
    setJobStatus({ status: "queued", progress: 0 });
    setUploadToast({
      status: "loading",
      title: "Indexing b-roll",
      description: `Starting index job for ${unindexedBrollCount} unindexed clip${unindexedBrollCount === 1 ? "" : "s"}...`,
    });
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
          customer_id: userId,
          chunk_duration: 3,
          overlap: 1,
          backend: "gemini",
        }),
      });

      if (!jobResponse.ok) {
        const error = (await jobResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(error?.error ?? "Failed to start indexing");
      }

      const job = (await jobResponse.json()) as { job_id?: string };

      if (!job.job_id) {
        throw new Error("Indexer did not return a job_id");
      }

      setJobStatus({ job_id: job.job_id, status: "queued", progress: 0 });
      setIndexMessage(`Indexing job ${job.job_id} is running...`);
      setUploadToast({
        status: "loading",
        title: "Indexing b-roll",
        description: `Index job ${job.job_id} is running...`,
      });
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
      setUploadToast({
        status: "success",
        title: "Indexing complete",
        description: "All unindexed b-roll clips have been indexed and refreshed.",
      });
      window.setTimeout(() => setUploadToast(null), 4000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Indexing failed";
      setJobStatus((currentStatus) => ({
        ...currentStatus,
        status: "failed",
        done: true,
        failed: true,
        error: message,
      }));
      setClips((currentClips) =>
        currentClips.map((clip) => ({
          ...clip,
          status: clip.indexed ? "indexed" : "failed",
        })),
      );
      setIndexMessage(message);
      setUploadToast({
        status: "error",
        title: "Indexing failed",
        description: message,
      });
    } finally {
      setIsIndexing(false);
    }
  };

  const handleUploadVideos = async (files: File[]) => {
    if (files.length === 0 || isUploadingVideos) {
      return;
    }

    setIsUploadingVideos(true);
    setIndexMessage(`Uploading ${files.length} video${files.length === 1 ? "" : "s"}...`);
    setUploadToast({
      status: "loading",
      title: "Uploading b-roll",
      description: `Preparing ${files.length} video${files.length === 1 ? "" : "s"}...`,
    });

    try {
      for (const [index, file] of files.entries()) {
        if (!uploadPrefix) {
          throw new Error("Upload destination is not loaded yet. Refresh and try again.");
        }

        const normalizedCreator = creator.trim().toLowerCase();

        if (!normalizedCreator) {
          throw new Error("Choose or type a creator before uploading.");
        }

        const filename = sanitizeFilename(file.name) || "video";
        const pathname = `${uploadPrefix}${Date.now()}-${filename}`;

        setUploadToast({
          status: "loading",
          title: "Uploading b-roll",
          description: `${file.name} (${index + 1}/${files.length}) is starting...`,
        });

        const blob = (await upload(pathname, file, {
          access: "private",
          handleUploadUrl: "/api/upload-video",
          multipart: true,
          contentType: file.type || "video/mp4",
          onUploadProgress: ({ percentage }) => {
            const progress = Math.round(percentage);
            setIndexMessage(
              `Uploading ${file.name} (${index + 1}/${files.length}) ${progress}%...`,
            );
            setUploadToast({
              status: "loading",
              title: "Uploading b-roll",
              description: `${file.name} (${index + 1}/${files.length}) ${progress}% uploaded...`,
            });
          },
        })) as PutBlobResult;

        setUploadToast({
          status: "loading",
          title: "Saving b-roll",
          description: `${file.name} uploaded. Adding metadata to Supabase...`,
        });

        const metadataResponse = await fetch("/api/brolls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: file.name,
            size: getSizeInMegabytes(file.size),
            blob_url: blob.url,
            creator: normalizedCreator,
          }),
        });

        if (!metadataResponse.ok) {
          const error = (await metadataResponse.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(error?.error ?? `Failed to save metadata for ${file.name}`);
        }
      }

      setIndexMessage(
        `${files.length} video${files.length === 1 ? "" : "s"} uploaded to Vercel Blob.`,
      );
      setUploadToast({
        status: "loading",
        title: "Refreshing library",
        description: "Upload complete. Fetching the updated b-roll list...",
      });
      await loadVideos();
      setUploadToast({
        status: "success",
        title: "B-roll ready",
        description: `${files.length} video${files.length === 1 ? " is" : "s are"} uploaded, saved, and ready to display.`,
      });
      window.setTimeout(() => setUploadToast(null), 4000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setIndexMessage(message);
      setUploadToast({
        status: "error",
        title: "Upload failed",
        description: message,
      });
    } finally {
      setIsUploadingVideos(false);
    }
  };

  const handleCreate = async () => {
    if (isCreating || brief.trim().length === 0) {
      return;
    }

    setIsCreating(true);
    setCreationStatus("clips");
    setCreatedQueryId("");
    setSearchRows([]);
    setSelectedResultIdsByRow({});
    setFinalAudioUrl("");
    setFinalAudioDuration(0);
    setSearchError("");
    setFinalAudioError("");
    setUploadToast({
      status: "loading",
      title: "Creating video",
      description: "Fetching the best performing clips...",
    });

    try {
      const parsedPrompts = parseVisualBrollPrompts(brief);
      const response = await fetch("/api/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query_text: brief.trim() }),
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(error?.error ?? "Failed to create query");
      }

      const data = (await response.json()) as { query?: { query_id?: string } | null };
      const queryId = data.query?.query_id;

      if (!queryId) {
        throw new Error("Query did not return a query_id");
      }

      setCreatedQueryId(queryId);

      const searchResponse = await fetch(`${INDEX_API_BASE_URL}/search/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: userId || "gruns",
          items: parsedPrompts.map((prompt) => ({ visual_broll: prompt.visual_broll })),
          results: 5,
          save_top: 5,
          trim: true,
          force_trim_low_confidence: true,
          backend: "gemini",
        }),
      });

      if (!searchResponse.ok) {
        const error = (await searchResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(error?.error ?? "Batch search failed");
      }

      const searchResult = (await searchResponse.json()) as BatchSearchResponse;
      const nextRows = searchResult.rows.map((row) => ({
        id: `${row.index}-${row.visual_broll}`,
        query: row.query ?? row.visual_broll,
        results: row.results.slice(0, 5),
      }));

      setSearchRows(nextRows);
      setSelectedResultIdsByRow(
        Object.fromEntries(
          nextRows
            .filter((row) => row.results[0])
            .map((row) => [row.id, getSearchResultId(row.results[0])]),
        ),
      );

      await fetch(`/api/queries/${queryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broll_jsonb: searchResult.rows }),
      });

      setCreationStatus("audio");
      setUploadToast({
        status: "loading",
        title: "Creating video",
        description: "Fetching the highest quality audio...",
      });

      const transcript = parsedPrompts
        .map((prompt) => prompt.transcript)
        .filter((line): line is string => Boolean(line))
        .join("\n\n");

      if (transcript) {
        setIsGeneratingAudio(true);
        const audioResponse = await fetch("/api/query-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query_id: queryId, transcript }),
        });

        if (!audioResponse.ok) {
          const error = (await audioResponse.json().catch(() => null)) as { error?: string } | null;
          throw new Error(error?.error ?? "Final audio generation failed");
        }

        const audioResult = (await audioResponse.json()) as {
          audio_url: string;
          stream_url: string;
        };
        setFinalAudioUrl(audioResult.stream_url);
      }

      setCreationStatus("complete");
      setUploadToast({
        status: "success",
        title: "Complete",
        description: "Video created. Preview is ready.",
      });
      window.setTimeout(() => setUploadToast(null), 3500);
    } catch (error) {
      setSearchRows([]);
      setSelectedResultIdsByRow({});
      const message = error instanceof Error ? error.message : "Failed to create query";
      setSearchError(message);
      setCreationStatus("error");
      setUploadToast({
        status: "error",
        title: "Creation failed",
        description: message,
      });
    } finally {
      setIsGeneratingAudio(false);
      setIsCreating(false);
    }
  };

  return (
    <>
      <main className="flex h-full min-h-0 overflow-hidden bg-[#f7f6f2] text-neutral-950">
        <section
          className={
            shouldShowResultPanel
              ? "min-h-0 basis-3/5 overflow-hidden transition-[flex-basis] duration-700 ease-out"
              : "min-h-0 basis-full overflow-hidden transition-[flex-basis] duration-700 ease-out"
          }
        >
          <CreateHome
            brief={brief}
            clips={clips}
            totalBrollCount={totalBrollCount}
            indexedBrollCount={indexedBrollCount}
            canCreate={canCreate}
            canIndex={canIndex}
            isCreating={isCreating}
            isIndexing={isIndexing}
            isLoadingVideos={isLoadingVideos}
            isUploadingVideos={isUploadingVideos}
            apiBaseUrl={INDEX_API_BASE_URL}
            creator={creator}
            creatorOptions={CREATOR_OPTIONS}
            error={searchError}
            onBriefChange={setBrief}
            onCreatorChange={setCreator}
            onCreate={handleCreate}
            onIndex={handleIndex}
            onUploadVideos={(files) => void handleUploadVideos(files)}
            onRefreshVideos={() => void loadVideos()}
          />
        </section>

        <aside
          className={
            shouldShowResultPanel
              ? "relative min-h-0 basis-2/5 overflow-y-auto border-l border-neutral-200 px-5 py-6 opacity-100 transition-[flex-basis,opacity] duration-700 ease-out"
              : "relative min-h-0 basis-0 overflow-hidden border-l border-transparent opacity-0 transition-[flex-basis,opacity] duration-700 ease-out"
          }
        >
          <div className="mx-auto grid min-h-full max-w-md content-center gap-5">
            <div>
              <p className="m-0 font-playfair text-sm font-semibold text-neutral-500">
                {creationStatus === "clips"
                  ? "Fetching the best performing clips..."
                  : creationStatus === "audio"
                    ? "Fetching the highest quality audio..."
                    : creationStatus === "complete"
                      ? "Complete"
                      : creationStatus === "error"
                        ? "Creation failed"
                        : "Preparing"}
              </p>
              <h2 className="m-0 mt-1 font-playfair text-4xl font-semibold tracking-[-0.045em]">
                {creationStatus === "complete" ? "Your cut is ready" : "Creating cut"}
              </h2>
            </div>

            {creationStatus === "complete" ? (
              <>
                <FinalVideo
                  clips={selectedClips}
                  apiBaseUrl={INDEX_API_BASE_URL}
                  expectedClipCount={searchRows.length}
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
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white px-4 font-playfair text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50"
                    type="button"
                    disabled={!createdQueryId}
                    onClick={() => window.location.assign(`/studio/${encodeURIComponent(createdQueryId)}`)}
                  >
                    <Pencil className="mr-2 size-4" />
                    Edit in Studio
                  </button>
                  <button
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-neutral-950 px-4 font-playfair text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
                    type="button"
                    onClick={() =>
                      setUploadToast({
                        status: "success",
                        title: "Ready to share",
                        description: "Export/share wiring can plug in here next.",
                      })
                    }
                  >
                    <Share2 className="mr-2 size-4" />
                    Export / Share
                  </button>
                </div>
              </>
            ) : (
              <div className="grid aspect-[9/16] w-full max-w-[260px] place-items-center justify-self-center rounded-[2.5rem] border-[10px] border-neutral-950 bg-neutral-950 text-center text-sm font-semibold text-white/70 shadow-2xl">
                <div className="grid justify-items-center gap-3 px-8">
                  <Sparkles className="size-7 animate-pulse text-emerald-300" />
                  <span>
                    {creationStatus === "error"
                      ? searchError || finalAudioError || "Something went wrong."
                      : creationStatus === "audio"
                        ? "Laying voiceover over the selected clips..."
                        : "Finding the right visual sequence..."}
                  </span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>
      <UploadToast toast={uploadToast} />
    </>
  );
};

export default YolocutPage;
