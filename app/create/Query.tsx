"use client";

/* eslint-disable @remotion/warn-native-media-tag */

import { Loader2, RefreshCw, Upload } from "lucide-react";
import { useRef } from "react";
import { Button } from "../../src/components/ui/button";
import { Card } from "../../src/components/ui/card";
import { Textarea } from "../../src/components/ui/textarea";
import { CreatorSelect } from "./CreatorSelect";

type BrollClip = {
  id: string;
  name: string;
  url: string;
  size: string;
  creator: string;
  indexed: boolean;
  status: "pending" | "indexing" | "indexed" | "failed";
};

type IndexJobStatus = {
  status?: string;
  progress?: number;
  current_file?: string;
  files_done?: number;
  total_files?: number;
  current_chunk?: number;
  total_chunks_in_file?: number;
  succeeded?: boolean;
  failed?: boolean;
};

type QueryProps = {
  brief: string;
  clips: BrollClip[];
  canIndex: boolean;
  isIndexing: boolean;
  isLoadingVideos: boolean;
  isUploadingVideos: boolean;
  indexMessage: string;
  jobStatus: IndexJobStatus | null;
  jobProgressPercent: number | null;
  apiBaseUrl: string;
  creator: string;
  creatorOptions: string[];
  onBriefChange: (value: string) => void;
  onCreatorChange: (value: string) => void;
  onIndex: () => void;
  onUploadVideos: (files: File[]) => void;
  onRefreshVideos: () => void;
};

const getClipAssetUrl = (url: string, apiBaseUrl: string) => {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (url.startsWith("/")) {
    return url;
  }

  return `${apiBaseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
};

const getFileName = (path: string) => {
  return path.split(/[\\/]/).pop() ?? path;
};

export const Query = ({
  brief,
  clips,
  canIndex,
  isIndexing,
  isLoadingVideos,
  isUploadingVideos,
  indexMessage,
  jobStatus,
  jobProgressPercent,
  apiBaseUrl,
  creator,
  creatorOptions,
  onBriefChange,
  onCreatorChange,
  onIndex,
  onUploadVideos,
  onRefreshVideos,
}: QueryProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="min-h-0 overflow-hidden border-r border-neutral-200 bg-white/85 max-[900px]:border-b max-[900px]:border-r-0">
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-neutral-200 px-7">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-emerald-200 text-base font-black text-emerald-700">
              Y
            </div>
            <h1 className="m-0 font-serif text-xl font-bold tracking-[-0.02em]">
              YOLOCUT
            </h1>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6">
          <Card className="mb-5 overflow-hidden">
            <div className="border-b border-neutral-100 px-5 py-4">
              <p className="m-0 text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
                Cut brief
              </p>
              <h2 className="m-0 mt-1 font-serif text-xl font-bold tracking-[-0.02em]">
                What are we making?
              </h2>
            </div>
            <div className="grid gap-3 p-5">
              <label className="text-sm font-semibold text-neutral-600" htmlFor="brief">
                Enter brief
              </label>
              <Textarea
                id="brief"
                rows={5}
                value={brief}
                onChange={(event) => onBriefChange(event.target.value)}
                placeholder={`[
  { "visual_broll": "close-up of green supplement packet on a kitchen counter" },
  { "visual_broll": "person pouring greens powder into a glass of water" }
]`}
              />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-5 py-4">
              <div>
                <p className="m-0 text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
                  Assets
                </p>
                <h2 className="m-0 mt-1 font-serif text-xl font-bold tracking-[-0.02em]">
                  B-roll clips
                </h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  accept="video/*,.mov,.mp4,.m4v,.webm,.mkv,.avi"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";

                    if (files.length > 0) {
                      onUploadVideos(files);
                    }
                  }}
                />
                <Button
                  variant="outline"
                  className="h-9 rounded-[14px] px-3 text-sm shadow-sm"
                  onClick={onRefreshVideos}
                  disabled={isLoadingVideos || isIndexing}
                >
                  {isLoadingVideos ? (
                    "Loading..."
                  ) : (
                    <>
                      <RefreshCw className="mr-1.5 size-4" />
                      Refresh
                    </>
                  )}
                </Button>
                <Button
                  className="h-9 rounded-[14px] px-4 text-sm"
                  onClick={onIndex}
                  disabled={!canIndex}
                >
                  {isIndexing ? "Indexing..." : "Index"}
                </Button>
                <CreatorSelect
                  value={creator}
                  options={creatorOptions}
                  disabled={isUploadingVideos}
                  onChange={onCreatorChange}
                />
                <Button
                  variant="outline"
                  className="size-9 rounded-[14px] px-0 text-neutral-700 shadow-sm"
                  disabled={isUploadingVideos}
                  aria-label="Upload videos"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploadingVideos ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="grid gap-2 border-b border-neutral-100 px-5 py-4">
              {indexMessage ? (
                <p className="m-0 text-xs font-medium text-neutral-600">{indexMessage}</p>
              ) : null}
              {jobStatus ? (
                <div className="grid gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500">
                      Index job
                    </span>
                    <span
                      className={
                        jobStatus.failed
                          ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"
                          : jobStatus.succeeded
                            ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                            : "rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
                      }
                    >
                      {jobStatus.status ?? "queued"}
                    </span>
                  </div>

                  <div className="grid gap-1.5">
                    <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${jobProgressPercent ?? 3}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
                      <span>
                        {jobProgressPercent === null
                          ? "Waiting for progress..."
                          : `${jobProgressPercent}% complete`}
                      </span>
                      {typeof jobStatus.files_done === "number" &&
                      typeof jobStatus.total_files === "number" ? (
                        <span>
                          {jobStatus.files_done}/{jobStatus.total_files} files
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {jobStatus.current_file ? (
                    <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-neutral-600">
                      Current file:{" "}
                      <span className="font-medium">{getFileName(jobStatus.current_file)}</span>
                    </p>
                  ) : null}

                  {typeof jobStatus.current_chunk === "number" &&
                  typeof jobStatus.total_chunks_in_file === "number" ? (
                    <p className="m-0 text-xs text-neutral-500">
                      Chunk {jobStatus.current_chunk}/{jobStatus.total_chunks_in_file}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div
              className="grid max-h-[38vh] min-h-0 content-start gap-2 overflow-y-auto p-3"
              aria-label="Vercel Blob B-roll clips"
            >
              {clips.length > 0 ? (
                clips.map((clip) => (
                  <div
                    key={clip.id}
                    className="grid min-h-[76px] grid-cols-[86px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-neutral-100 bg-white px-3 py-2.5 hover:border-neutral-200 hover:bg-[#fbfaf7]"
                  >
                    <div className="relative aspect-video overflow-hidden rounded-lg bg-neutral-950 shadow-inner">
                      <video
                        className="size-full object-cover"
                        src={getClipAssetUrl(clip.url, apiBaseUrl)}
                        muted
                        preload="metadata"
                        playsInline
                      />
                      {clip.indexed ? (
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
                    <div className="grid min-w-0 gap-1">
                      <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-neutral-950">
                        {clip.name}
                      </strong>
                      <span className="text-[13px] text-neutral-500">{clip.size}</span>
                      {clip.creator ? (
                        <span className="w-fit rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">
                          {clip.creator}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={
                        clip.status === "indexed"
                          ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                          : clip.status === "failed"
                            ? "rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
                            : "rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600"
                      }
                    >
                      {clip.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500">
                  No b-roll videos found in yolocut-broll yet.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};
