"use client";

/* eslint-disable @remotion/warn-native-media-tag */

import { useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Pencil, Share2, Sparkles } from "lucide-react";
import { type PutBlobResult } from "@vercel/blob";
import { CreateHome } from "./CreateHome";
import { FinalVideo, type CaptionToken, type FinalVideoHandle } from "./FinalVideo";
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

type CreationStatus =
  | "idle"
  | "clips"
  | "audio"
  | "captions"
  | "segments"
  | "music"
  | "complete"
  | "error";

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
const MIN_TIMED_SEGMENT_SECONDS = 0.6;
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

const getClipDuration = (clip: SearchClipResult) => {
  return Math.max(0, clip.end_time - clip.start_time);
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

type TimedPromptSegment = {
  start: number;
  end: number;
};

const normalizeWords = (value: string) => {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
};

const findWordSequence = (
  captionWords: Array<{ word: string; caption: CaptionToken }>,
  targetWords: string[],
  cursor: number,
) => {
  if (targetWords.length === 0) {
    return null;
  }

  for (let index = cursor; index <= captionWords.length - targetWords.length; index += 1) {
    const matches = targetWords.every((word, offset) => captionWords[index + offset]?.word === word);

    if (matches) {
      return {
        startIndex: index,
        endIndex: index + targetWords.length - 1,
      };
    }
  }

  return null;
};

const getPromptSegmentsFromCaptions = (
  prompts: VisualBrollPrompt[],
  captions: CaptionToken[],
  durationMs: number,
): TimedPromptSegment[] => {
  const lastCaptionEndSeconds = (captions.at(-1)?.endMs ?? 0) / 1000;
  const totalDuration = Math.max(durationMs / 1000, lastCaptionEndSeconds);
  const captionWords = captions
    .map((caption) => ({
      caption,
      word: normalizeWords(caption.text)[0] ?? "",
    }))
    .filter((item) => item.word);
  const transcriptWordsByPrompt = prompts.map((prompt) => normalizeWords(prompt.transcript ?? ""));
  const matchedSegments: Array<TimedPromptSegment | null> = [];
  let cursor = 0;

  for (const words of transcriptWordsByPrompt) {
    const match = findWordSequence(captionWords, words, cursor);

    if (!match) {
      matchedSegments.push(null);
      continue;
    }

    matchedSegments.push({
      start: captionWords[match.startIndex].caption.startMs / 1000,
      end: captionWords[match.endIndex].caption.endMs / 1000,
    });
    cursor = match.endIndex + 1;
  }

  if (matchedSegments.every(Boolean)) {
    return matchedSegments.map((segment, index) => {
      const start = index === 0 ? 0 : matchedSegments[index - 1]?.end ?? segment?.start ?? 0;
      const fallbackEnd = index === matchedSegments.length - 1 ? totalDuration : segment?.end ?? start;
      const end = Math.max(start + MIN_TIMED_SEGMENT_SECONDS, fallbackEnd);

      return { start, end };
    });
  }

  const transcriptLengths = prompts.map((prompt) =>
    Math.max(1, normalizeWords(prompt.transcript ?? prompt.visual_broll).length),
  );
  const totalTranscriptLength = transcriptLengths.reduce((sum, length) => sum + length, 0) || 1;
  let cursorSeconds = 0;

  return transcriptLengths.map((length, index) => {
    const isLast = index === transcriptLengths.length - 1;
    const segmentDuration = isLast
      ? totalDuration - cursorSeconds
      : totalDuration * (length / totalTranscriptLength);
    const start = cursorSeconds;
    const end = Math.max(start + MIN_TIMED_SEGMENT_SECONDS, start + segmentDuration);
    cursorSeconds = end;

    return { start, end };
  });
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

const getSelectedResult = (row: SearchRow, selectedResultIdsByRow: Record<string, string>) => {
  const selectedResultId = selectedResultIdsByRow[row.id];

  return (
    row.results.find((result) => getSearchResultId(result) === selectedResultId) ?? row.results[0]
  );
};

const expandClipToSegmentDuration = (
  clip: SearchClipResult,
  segment: TimedPromptSegment,
): SearchClipResult => {
  const targetDuration = Math.max(MIN_TIMED_SEGMENT_SECONDS, segment.end - segment.start);
  const sourceDuration = Math.max(0, clip.end_time - clip.start_time);
  const sourceCenter = sourceDuration > 0 ? clip.start_time + sourceDuration / 2 : clip.start_time;
  const start = Math.max(0, sourceCenter - targetDuration / 2);
  const end = start + targetDuration;

  return {
    ...clip,
    start_time: start,
    end_time: end,
    start_time_formatted: formatClipTime(start),
    end_time_formatted: formatClipTime(end),
  };
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
  const [finalMusicUrl, setFinalMusicUrl] = useState("");
  const [finalClips, setFinalClips] = useState<SearchClipResult[]>([]);
  const [finalCaptions, setFinalCaptions] = useState<CaptionToken[]>([]);
  const [, setFinalAudioDuration] = useState(0);
  const finalVideoRef = useRef<FinalVideoHandle>(null);
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
      const selectedResult = getSelectedResult(row, selectedResultIdsByRow);

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

  useEffect(() => {
    return () => {
      finalClips.forEach((clip) => {
        if (clip.clip_url?.startsWith("blob:")) {
          URL.revokeObjectURL(clip.clip_url);
        }
      });
    };
  }, [finalClips]);

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

  const prepareTrimmedFinalClips = async (
    rows: SearchRow[],
    selectedIds: Record<string, string>,
    segments: TimedPromptSegment[],
  ) => {
    const trimmedClips: Array<SearchClipResult | null> = await Promise.all(
      rows.map(async (row, index): Promise<SearchClipResult | null> => {
        const selectedResult = getSelectedResult(row, selectedIds);

        if (!selectedResult) {
          return null;
        }

        const segment = segments[index] ?? {
          start: 0,
          end: getClipDuration(selectedResult),
        };
        const expandedClip = expandClipToSegmentDuration(selectedResult, segment);
        const pathname =
          getBlobPathname(expandedClip.source_file) ||
          getBlobPathname(expandedClip.clip_stream_url) ||
          getBlobPathname(expandedClip.clip_url);

        if (!pathname) {
          throw new Error(`Could not resolve blob path for ${expandedClip.source_basename}`);
        }

        const trimResponse = await fetch("/api/clip-trim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pathname,
            start: expandedClip.start_time,
            end: expandedClip.end_time,
          }),
        });

        if (!trimResponse.ok) {
          const error = (await trimResponse.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(error?.error ?? `Failed to trim ${expandedClip.source_basename}`);
        }

        const objectUrl = URL.createObjectURL(await trimResponse.blob());
        const duration = Math.max(
          MIN_TIMED_SEGMENT_SECONDS,
          expandedClip.end_time - expandedClip.start_time,
        );

        return {
          ...expandedClip,
          clip_url: objectUrl,
          clip_stream_url: objectUrl,
          start_time: 0,
          end_time: duration,
          start_time_formatted: formatClipTime(0),
          end_time_formatted: formatClipTime(duration),
        };
      }),
    );

    return trimmedClips.filter((clip): clip is SearchClipResult => clip !== null);
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
    setFinalMusicUrl("");
    setFinalClips([]);
    setFinalCaptions([]);
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
      const nextSelectedResultIdsByRow = Object.fromEntries(
        nextRows
          .filter((row) => row.results[0])
          .map((row) => [row.id, getSearchResultId(row.results[0])]),
      );

      setSearchRows(nextRows);
      setSelectedResultIdsByRow(nextSelectedResultIdsByRow);

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

        setCreationStatus("captions");
        setUploadToast({
          status: "loading",
          title: "Creating video",
          description: "Transcribing the voiceover and applying captions...",
        });

        const captionsResponse = await fetch("/api/query-captions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query_id: queryId,
            audio_url: audioResult.audio_url,
          }),
        });

        if (!captionsResponse.ok) {
          const error = (await captionsResponse.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(error?.error ?? "Caption generation failed");
        }

        const captionsResult = (await captionsResponse.json()) as {
          captions: CaptionToken[];
          captions_url: string;
          duration_ms: number;
        };
        setFinalCaptions(captionsResult.captions);

        setCreationStatus("segments");
        setUploadToast({
          status: "loading",
          title: "Creating video",
          description: "Timing the captions to b-roll and preloading MP4 clips...",
        });

        const promptSegments = getPromptSegmentsFromCaptions(
          parsedPrompts,
          captionsResult.captions,
          captionsResult.duration_ms,
        );
        const promptTimedSelectedClips = nextRows.map((row, index) => {
          const selectedResult = getSelectedResult(row, nextSelectedResultIdsByRow);
          const segment = promptSegments[index];

          return selectedResult && segment
            ? expandClipToSegmentDuration(selectedResult, segment)
            : selectedResult ?? null;
        });
        const trimmedFinalClips = await prepareTrimmedFinalClips(
          nextRows,
          nextSelectedResultIdsByRow,
          promptSegments,
        );
        setFinalClips(trimmedFinalClips);

        await fetch(`/api/queries/${queryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            broll_jsonb: nextRows.map((row, index) => ({
              index,
              visual_broll: row.query,
              query: row.query,
              results: row.results,
              selected_result: promptTimedSelectedClips[index] ?? null,
              prompt_time_range: promptSegments[index] ?? null,
            })),
          }),
        });

        setCreationStatus("music");
        setUploadToast({
          status: "loading",
          title: "Creating video",
          description: "Composing background music for the cut...",
        });

        try {
          const musicResponse = await fetch("/api/query-music", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query_id: queryId,
              duration_ms: captionsResult.duration_ms,
            }),
          });

          if (musicResponse.ok) {
            const musicResult = (await musicResponse.json()) as {
              music_url: string;
              stream_url: string;
            };
            setFinalMusicUrl(musicResult.stream_url);
          }
        } catch {
          // Background music is optional — keep the cut even if it fails.
        }
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
          <div className="mx-auto grid min-h-full content-center gap-5">
            <div className="text-center">
              <p className="m-0 font-playfair text-sm font-semibold text-neutral-500">
                {creationStatus === "clips"
                  ? "Fetching the best performing clips..."
                  : creationStatus === "audio"
                    ? "Fetching the highest quality audio..."
                    : creationStatus === "captions"
                      ? "Transcribing and applying captions..."
                      : creationStatus === "segments"
                        ? "Preparing seamless MP4 segments..."
                        : creationStatus === "music"
                          ? "Composing background music..."
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
                  ref={finalVideoRef}
                  clips={finalClips.length > 0 ? finalClips : selectedClips}
                  apiBaseUrl={INDEX_API_BASE_URL}
                  expectedClipCount={searchRows.length}
                  audioUrl={finalAudioUrl}
                  musicUrl={finalMusicUrl}
                  captions={finalCaptions}
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
                <div className="flex flex-row gap-2 mx-auto">
                  <button
                    className="inline-flex h-11 w-fit items-center justify-center rounded-2xl border border-neutral-200 bg-white px-4 font-playfair text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50"
                    type="button"
                    disabled={!createdQueryId}
                    onClick={() => window.location.assign(`/studio/${encodeURIComponent(createdQueryId)}`)}
                  >
                    <Pencil className="mr-2 size-4" />
                    Edit in Studio
                  </button>
                  <button
                    className="inline-flex h-11 w-fit items-center justify-center rounded-2xl bg-neutral-950 px-4 font-playfair text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
                    type="button"
                    onClick={async () => {
                      setUploadToast({
                        status: "loading",
                        title: "Exporting video",
                        description: "Recording the cut in real time...",
                      });

                      try {
                        await finalVideoRef.current?.exportVideo();
                        setUploadToast({
                          status: "success",
                          title: "Export complete",
                          description: "Your video has been downloaded.",
                        });
                        window.setTimeout(() => setUploadToast(null), 4000);
                      } catch (error) {
                        setUploadToast({
                          status: "error",
                          title: "Export failed",
                          description:
                            error instanceof Error
                              ? error.message
                              : "Could not export the video.",
                        });
                      }
                    }}
                  >
                    <Share2 className="mr-2 size-4" />
                    Export / Share
                  </button>
                </div>
              </>
            ) : (
              <div className="grid aspect-[9/16] w-full max-w-[260px] place-items-center justify-self-center rounded-[2.5rem] border-[10px] border-neutral-950 bg-neutral-950 text-center text-sm font-semibold text-white/70 shadow-2xl">
                <div className="grid justify-items-center gap-3 px-8">
                  <Sparkles className="size-7 animate-pulse text-emerald-300" strokeWidth={1} />
                  <span className="font-sans font-normal">
                    {creationStatus === "error"
                      ? searchError || finalAudioError || "Something went wrong."
                      : creationStatus === "audio"
                        ? "Laying voiceover over the selected clips..."
                        : creationStatus === "captions"
                          ? "Transcribing the voiceover and styling subtitles..."
                          : creationStatus === "segments"
                            ? "Preloading exact MP4 b-roll segments..."
                            : creationStatus === "music"
                              ? "Composing upbeat background music..."
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
