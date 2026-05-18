"use client";

/* eslint-disable @remotion/non-pure-animation, @remotion/warn-native-media-tag */

import { ArrowUp, DatabaseBackup, Loader2, RefreshCw, Upload } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";
import { Button } from "../../src/components/ui/button";
import { CreatorSelect } from "./CreatorSelect";

type BrollClip = {
  id: string;
  name: string;
  url: string;
  size: string;
  creator: string;
  indexed: boolean;
};

type CreateHomeProps = {
  brief: string;
  clips: BrollClip[];
  canCreate: boolean;
  canIndex: boolean;
  isCreating: boolean;
  isIndexing: boolean;
  isLoadingVideos: boolean;
  isUploadingVideos: boolean;
  apiBaseUrl: string;
  creator: string;
  creatorOptions: string[];
  onBriefChange: (value: string) => void;
  onCreatorChange: (value: string) => void;
  onCreate: () => void;
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

export const CreateHome = ({
  brief,
  clips,
  canCreate,
  canIndex,
  isCreating,
  isIndexing,
  isLoadingVideos,
  isUploadingVideos,
  apiBaseUrl,
  creator,
  creatorOptions,
  onBriefChange,
  onCreatorChange,
  onCreate,
  onIndex,
  onUploadVideos,
  onRefreshVideos,
}: CreateHomeProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const indexedClipCount = clips.filter((clip) => clip.indexed).length;
  const shouldAnimateAssets = clips.length >= 8;
  const carouselClips = shouldAnimateAssets ? [...clips, ...clips] : clips;

  return (
    <main className="grid h-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[#f7f6f2] px-5 pb-6 text-neutral-950 sm:pb-8">
      <section className="grid justify-items-center gap-3">
        <div className="grid w-full max-w-4xl justify-items-center gap-3">
          <Image
            src="/badger.png"
            alt="Yolocut"
            width={132}
            height={132}
            className="size-20 object-contain sm:size-24"
            priority
          />

          <div className="text-center">
            <h1 className="m-0 font-playfair text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
              Yolocut
            </h1>
            <p className="m-0 mt-1 font-playfair text-base font-semibold text-neutral-500 sm:text-lg">
              What are we cutting today?
            </p>
          </div>

          <div className="flex w-full max-w-3xl items-end gap-3 rounded-[2rem] border border-neutral-200 bg-white p-3 shadow-sm focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-100">
            <textarea
              className="max-h-28 min-h-12 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-base leading-6 text-neutral-950 outline-none placeholder:text-neutral-400"
              value={brief}
              onChange={(event) => onBriefChange(event.target.value)}
              placeholder='Lets make a viral hit...'
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  onCreate();
                }
              }}
            />
            <button
              className="mb-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-35"
              type="button"
              disabled={!canCreate || isCreating}
              onClick={onCreate}
              aria-label="Create"
            >
              {isCreating ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}
            </button>
          </div>
        </div>
      </section>

      <section className="min-h-0 w-full pt-5 mt-4">
        <div className="mx-auto grid h-full w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)]">
          <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <p className="m-0 font-playfair text-sm text-neutral-500">
                  {clips.length} clip{clips.length === 1 ? "" : "s"} in yolocut-broll
                  {clips.length > 0 ? ` · ${indexedClipCount} indexed` : ""}
                </p>
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
                  variant="text"
                  className="h-9 rounded-[14px] px-3 text-sm"
                  disabled={isLoadingVideos || isIndexing}
                  onClick={onRefreshVideos}
                >
                  <RefreshCw className="mr-1.5 size-4" />
                  Refresh
                </Button>
                <CreatorSelect
                  value={creator}
                  options={creatorOptions}
                  disabled={isUploadingVideos}
                  onChange={onCreatorChange}
                />
                <Button
                  variant="outline"
                  className="size-9 rounded-[14px] px-2 text-neutral-700 shadow-sm"
                  disabled={isUploadingVideos}
                  aria-label="Upload videos"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploadingVideos ? (
                    <Loader2 className="size-4 animate-spin shrink-0" />
                  ) : (
                    <Upload className="size-4 shrink-0" />
                  )}
                </Button>
                <Button
                  className="h-9 rounded-[14px] px-4 text-sm"
                  disabled={!canIndex}
                  onClick={onIndex}
                >
                  <DatabaseBackup className="mr-1.5 size-4" />
                  {isIndexing ? "Indexing..." : "Index"}
                </Button>
              </div>
            </div>

            <div className="relative min-h-0 overflow-hidden">
              {carouselClips.length > 0 ? (
                <div
                  className={
                    shouldAnimateAssets
                      ? "flex w-max gap-4 animate-[asset-marquee_70s_linear_infinite] hover:[animation-play-state:paused]"
                      : "flex flex-wrap gap-4"
                  }
                >
                  {carouselClips.map((clip, index) => (
                    <div
                      key={`${clip.id}-${index}`}
                      className="w-28 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm sm:w-32"
                    >
                      <div className="relative aspect-[9/16] bg-neutral-950">
                        <video
                          className="size-full object-cover"
                          src={getClipAssetUrl(clip.url, apiBaseUrl)}
                          autoPlay
                          loop
                          muted
                          preload="auto"
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
                      <div className="grid gap-1 px-3 py-3">
                        <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-neutral-950">
                          {clip.name}
                        </strong>
                        {clip.creator ? (
                          <span className="w-fit rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">
                            {clip.creator}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="font-playfair rounded-3xl border border-dashed border-neutral-200 bg-white/70 px-6 py-10 text-center text-sm font-medium text-neutral-500">
                  No footage in yolocut-broll yet. Upload b-roll to start creating.
                </div>
              )}
            </div>
        </div>
      </section>
    </main>
  );
};
