"use client";

import { useEffect, useMemo, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { type PutBlobResult } from "@vercel/blob";
import { CreateHome } from "./CreateHome";
import { FinalAudio } from "./FinalAudio";
import { FinalVideo } from "./FinalVideo";
import { Query } from "./Query";
import { UploadToast, type UploadToastState } from "./UploadToast";
import {
  Search,
  getSearchResultId,
  resolveSourceUrl,
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
  creator: string;
  modifiedAt: string;
  indexed: boolean;
  status: "pending" | "indexing" | "indexed" | "failed";
};

type VideosResponse = {
  directory: string;
  user_id?: string;
  upload_prefix?: string;
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
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [clips, setClips] = useState<BrollClip[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isUploadingVideos, setIsUploadingVideos] = useState(false);
  const [indexMessage, setIndexMessage] = useState("");
  const [jobStatus, setJobStatus] = useState<IndexJobStatus | null>(null);
  const [searchRows, setSearchRows] = useState<SearchRow[]>([]);
  const [selectedResultIdsByRow, setSelectedResultIdsByRow] = useState<Record<string, string>>({});
  const [searchPromptCount] = useState(0);
  const [searchError, setSearchError] = useState("");
  const [finalAudioUrl] = useState("");
  const [finalAudioDuration, setFinalAudioDuration] = useState(0);
  const [finalAudioError, setFinalAudioError] = useState("");
  const [editError, setEditError] = useState("");
  const [isGeneratingAudio] = useState(false);
  const [isOpeningEditor, setIsOpeningEditor] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadPrefix, setUploadPrefix] = useState("");
  const [userId, setUserId] = useState("");
  const [creator, setCreator] = useState(CREATOR_OPTIONS[0]);
  const [uploadToast, setUploadToast] = useState<UploadToastState>(null);

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

  const unindexedClipCount = useMemo(() => {
    return clips.filter((clip) => !clip.indexed).length;
  }, [clips]);

  const canIndex = unindexedClipCount > 0 && !isIndexing && !isLoadingVideos;
  const shouldShowCreateHome =
    !isCreating &&
    searchRows.length === 0 &&
    !searchError &&
    !finalAudioUrl &&
    !finalAudioError;

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
      setIndexMessage(
        data.count > 0
          ? `${data.count} b-roll clip${data.count === 1 ? "" : "s"} loaded from Supabase.`
          : "No b-roll clips found in yolocut-broll yet.",
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
      description: `Starting index job for ${unindexedClipCount} unindexed clip${unindexedClipCount === 1 ? "" : "s"}...`,
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
    if (!canCreate) {
      return;
    }

    setIsCreating(true);
    setSearchError("");
    setFinalAudioError("");
    try {
      parseVisualBrollPrompts(brief);
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

      router.push(`/studio/${queryId}`);
    } catch (error) {
      setSearchRows([]);
      setSelectedResultIdsByRow({});
      setSearchError(error instanceof Error ? error.message : "Failed to create query");
    } finally {
      setIsCreating(false);
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
    <>
    {shouldShowCreateHome ? (
      <CreateHome
        brief={brief}
        clips={clips}
        canCreate={canCreate}
        canIndex={canIndex}
        isCreating={isCreating}
        isIndexing={isIndexing}
        isLoadingVideos={isLoadingVideos}
        isUploadingVideos={isUploadingVideos}
        apiBaseUrl={INDEX_API_BASE_URL}
        creator={creator}
        creatorOptions={CREATOR_OPTIONS}
        onBriefChange={setBrief}
        onCreatorChange={setCreator}
        onCreate={handleCreate}
        onIndex={handleIndex}
        onUploadVideos={(files) => void handleUploadVideos(files)}
        onRefreshVideos={() => void loadVideos()}
      />
    ) : (
    <main className="grid h-full min-h-0 grid-cols-[minmax(360px,1.3fr)_minmax(0,2fr)_minmax(340px,1fr)] overflow-hidden bg-[#f7f6f2] text-neutral-950 max-[1100px]:grid-cols-1 max-[1100px]:grid-rows-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <Query
        brief={brief}
        clips={clips}
        canIndex={canIndex}
        isIndexing={isIndexing}
        isLoadingVideos={isLoadingVideos}
        isUploadingVideos={isUploadingVideos}
        indexMessage={indexMessage}
        jobStatus={jobStatus}
        jobProgressPercent={jobProgressPercent}
        apiBaseUrl={INDEX_API_BASE_URL}
        creator={creator}
        creatorOptions={CREATOR_OPTIONS}
        onBriefChange={setBrief}
        onCreatorChange={setCreator}
        onIndex={handleIndex}
        onUploadVideos={(files) => void handleUploadVideos(files)}
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
    )}
    <UploadToast toast={uploadToast} />
    </>
  );
};

export default YolocutPage;
