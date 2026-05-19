/* eslint-disable @remotion/warn-native-media-tag */

import { Clock3, Film, ListVideo, Pause, Play, Scissors, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../src/components/ui/button";
import { type SearchClipResult, resolveSourceUrl } from "./Search";

type FinalVideoProps = {
  clips: SearchClipResult[];
  apiBaseUrl: string;
  expectedClipCount: number;
  audioUrl: string;
};

const getClipDuration = (clip: SearchClipResult) => {
  return Math.max(0, clip.end_time - clip.start_time);
};

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

type MemoryClip = {
  status: "loading" | "ready" | "error";
  url: string;
};

export const FinalVideo = ({ clips, apiBaseUrl, expectedClipCount, audioUrl }: FinalVideoProps) => {
  const primaryVideoRef = useRef<HTMLVideoElement>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [sequenceElapsed, setSequenceElapsed] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [memoryClips, setMemoryClips] = useState<Record<number, MemoryClip>>({});
  const activeSlotRef = useRef<0 | 1>(0);
  const currentIndexRef = useRef(0);
  const isPlayingSequenceRef = useRef(false);

  const currentClip = clips[currentIndex] ?? null;
  const currentClipUrl = currentClip ? resolveSourceUrl(currentClip, apiBaseUrl) : null;
  const expectedClips = Math.max(expectedClipCount, clips.length);
  const missingClipCount = Math.max(0, expectedClips - clips.length);
  const clipUrls = useMemo(() => {
    return clips.map((clip) => resolveSourceUrl(clip, apiBaseUrl));
  }, [apiBaseUrl, clips]);
  const playableClipUrls = useMemo(() => {
    return clipUrls.map((url, index) => memoryClips[index]?.url ?? url);
  }, [clipUrls, memoryClips]);
  const loadedClipCount = clipUrls.filter((url, index) => !url || memoryClips[index]?.status === "ready").length;
  const isPreloadingClips = clips.length > 0 && loadedClipCount < clips.length;
  const canPlaySequence = (clips.length === 0 && Boolean(audioUrl)) || (clips.length > 0 && !isPreloadingClips);
  const brollDuration = useMemo(() => {
    return clips.reduce((duration, clip) => duration + getClipDuration(clip), 0);
  }, [clips]);
  const totalDuration = audioDuration || brollDuration;
  const elapsedBeforeCurrentClip = useMemo(() => {
    return clips
      .slice(0, currentIndex)
      .reduce((duration, clip) => duration + getClipDuration(clip), 0);
  }, [clips, currentIndex]);
  const progressPercent = totalDuration > 0 ? (sequenceElapsed / totalDuration) * 100 : 0;

  const getVideoElement = useCallback((slot: 0 | 1) => {
    return slot === 0 ? primaryVideoRef.current : secondaryVideoRef.current;
  }, []);

  const prepareVideo = useCallback((slot: 0 | 1, clipIndex: number) => {
    const video = getVideoElement(slot);
    const clip = clips[clipIndex];
    const clipUrl = playableClipUrls[clipIndex];

    if (!video || !clip || !clipUrl) {
      if (video) {
        video.removeAttribute("src");
        video.removeAttribute("data-clip-index");
        video.load();
      }
      return;
    }

    const nextClipIndex = String(clipIndex);
    if (video.dataset.clipIndex !== nextClipIndex || video.getAttribute("src") !== clipUrl) {
      video.dataset.clipIndex = nextClipIndex;
      video.src = clipUrl;
      video.load();
    }

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      video.currentTime = clip.start_time;
    }
  }, [clips, getVideoElement, playableClipUrls]);

  const playSequence = () => {
    if (!canPlaySequence) {
      return;
    }

    prepareVideo(0, 0);
    prepareVideo(1, 1);
    activeSlotRef.current = 0;
    currentIndexRef.current = 0;
    setActiveSlot(0);
    setCurrentIndex(0);
    setSequenceElapsed(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => setIsPlayingSequence(false));
    }
    const activeVideo = getVideoElement(0);
    if (activeVideo) {
      void activeVideo.play().catch(() => setIsPlayingSequence(false));
    }
    setIsPlayingSequence(true);
  };

  const stopSequence = () => {
    primaryVideoRef.current?.pause();
    secondaryVideoRef.current?.pause();
    audioRef.current?.pause();
    setIsPlayingSequence(false);
  };

  const advanceClip = () => {
    const activeVideo = getVideoElement(activeSlotRef.current);
    const nextIndex = currentIndexRef.current + 1;

    if (nextIndex < clips.length) {
      const nextSlot = activeSlotRef.current === 0 ? 1 : 0;
      const nextElapsed = clips
        .slice(0, nextIndex)
        .reduce((duration, clip) => duration + getClipDuration(clip), 0);

      activeVideo?.pause();
      prepareVideo(nextSlot, nextIndex);
      prepareVideo(activeSlotRef.current, nextIndex + 1);
      activeSlotRef.current = nextSlot;
      currentIndexRef.current = nextIndex;
      setActiveSlot(nextSlot);
      setSequenceElapsed(nextElapsed);
      setCurrentIndex(nextIndex);
      window.requestAnimationFrame(() => {
        if (isPlayingSequenceRef.current) {
          const nextVideo = getVideoElement(nextSlot);
          if (nextVideo) {
            void nextVideo.play().catch(() => setIsPlayingSequence(false));
          }
        }
      });
      return;
    }

    activeVideo?.pause();
    const finalClip = clips[currentIndexRef.current];
    if (activeVideo && finalClip) {
      activeVideo.currentTime = Math.max(finalClip.start_time, finalClip.end_time - 0.05);
    }
    if (!audioUrl) {
      setSequenceElapsed(totalDuration);
      setIsPlayingSequence(false);
    }
  };

  const handleSelectClip = (index: number) => {
    const elapsed = clips
      .slice(0, index)
      .reduce((duration, clip) => duration + getClipDuration(clip), 0);

    setCurrentIndex(index);
    currentIndexRef.current = index;
    activeSlotRef.current = 0;
    setActiveSlot(0);
    setSequenceElapsed(elapsed);
  };

  useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);

  useEffect(() => {
    isPlayingSequenceRef.current = isPlayingSequence;
  }, [isPlayingSequence]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    prepareVideo(activeSlot, currentIndex);
    prepareVideo(activeSlot === 0 ? 1 : 0, currentIndex + 1);

    if (!isPlayingSequence) {
      return;
    }

    const activeVideo = getVideoElement(activeSlot);
    if (activeVideo) {
      void activeVideo.play().catch(() => setIsPlayingSequence(false));
    }
  }, [activeSlot, currentIndex, isPlayingSequence, prepareVideo, getVideoElement]);

  useEffect(() => {
    setCurrentIndex(0);
    setActiveSlot(0);
    setSequenceElapsed(0);
    setIsPlayingSequence(false);
  }, [clips]);

  useEffect(() => {
    let isMounted = true;
    const objectUrls: string[] = [];
    const abortController = new AbortController();

    setMemoryClips({});

    clipUrls.forEach((clipUrl, index) => {
      if (!clipUrl) {
        return;
      }

      setMemoryClips((current) => ({
        ...current,
        [index]: { status: "loading", url: clipUrl },
      }));

      void fetch(clipUrl, { signal: abortController.signal })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Failed to preload clip ${index + 1}`);
          }

          return response.blob();
        })
        .then((blob) => {
          if (!isMounted) {
            return;
          }

          const objectUrl = URL.createObjectURL(blob);
          objectUrls.push(objectUrl);
          setMemoryClips((current) => ({
            ...current,
            [index]: { status: "ready", url: objectUrl },
          }));
        })
        .catch(() => {
          if (!isMounted || abortController.signal.aborted) {
            return;
          }

          setMemoryClips((current) => ({
            ...current,
            [index]: { status: "error", url: clipUrl },
          }));
        });
    });

    return () => {
      isMounted = false;
      abortController.abort();
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };
  }, [clipUrls]);

  useEffect(() => {
    setAudioDuration(0);
    setSequenceElapsed(0);
    setIsPlayingSequence(false);
  }, [audioUrl]);

  return (
    <div className="grid gap-5">
      <div>
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-emerald-500">
            <Scissors className="size-4" />
            <span>Final video</span>
          </div>
        </div>

          <div className="relative w-full max-w-[310px] rounded-[2.35rem] border-[10px] border-neutral-950 bg-neutral-950 p-1 shadow-2xl">
            <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-neutral-950" />
            <div className="relative aspect-[9/16] overflow-hidden rounded-[1.55rem] bg-neutral-950">
              {currentClip && currentClipUrl ? (
                <video
                  ref={primaryVideoRef}
                  className={
                    activeSlot === 0
                      ? "absolute inset-0 size-full object-cover opacity-100"
                      : "absolute inset-0 size-full object-cover opacity-0"
                  }
                  preload="auto"
                  muted
                  playsInline
                  onLoadedMetadata={(event) => {
                    const clipIndex = Number(event.currentTarget.dataset.clipIndex ?? "-1");
                    const loadedClip = clips[clipIndex];
                    if (loadedClip) {
                      event.currentTarget.currentTime = loadedClip.start_time;
                      if (activeSlot === 0 && isPlayingSequence) {
                        void event.currentTarget.play().catch(() => setIsPlayingSequence(false));
                      }
                    }
                  }}
                  onTimeUpdate={(event) => {
                    if (activeSlot !== 0 || !currentClip) {
                      return;
                    }

                    const clipElapsed = Math.max(
                      0,
                      event.currentTarget.currentTime - currentClip.start_time,
                    );
                    if (!audioUrl) {
                      setSequenceElapsed(
                        Math.min(totalDuration, elapsedBeforeCurrentClip + clipElapsed),
                      );
                    }

                    if (event.currentTarget.currentTime >= currentClip.end_time - 0.03) {
                      advanceClip();
                    }
                  }}
                  onEnded={advanceClip}
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center px-6 text-center text-sm font-medium text-white/70">
                  <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-white/10">
                    <Film className="size-6" />
                  </div>
                  {audioUrl && isPlayingSequence
                    ? "B-roll finished. Voiceover continues on black."
                    : isPreloadingClips
                      ? `Preloading ${loadedClipCount}/${clips.length} clips into memory...`
                      : "Select search results to preview the stitched sequence."}
                </div>
              )}
              {currentClip && currentClipUrl ? (
                <video
                  ref={secondaryVideoRef}
                  className={
                    activeSlot === 1
                      ? "absolute inset-0 size-full object-cover opacity-100"
                      : "absolute inset-0 size-full object-cover opacity-0"
                  }
                  preload="auto"
                  muted
                  playsInline
                  onLoadedMetadata={(event) => {
                    const clipIndex = Number(event.currentTarget.dataset.clipIndex ?? "-1");
                    const loadedClip = clips[clipIndex];
                    if (loadedClip) {
                      event.currentTarget.currentTime = loadedClip.start_time;
                      if (activeSlot === 1 && isPlayingSequence) {
                        void event.currentTarget.play().catch(() => setIsPlayingSequence(false));
                      }
                    }
                  }}
                  onTimeUpdate={(event) => {
                    if (activeSlot !== 1 || !currentClip) {
                      return;
                    }

                    const clipElapsed = Math.max(
                      0,
                      event.currentTarget.currentTime - currentClip.start_time,
                    );
                    if (!audioUrl) {
                      setSequenceElapsed(
                        Math.min(totalDuration, elapsedBeforeCurrentClip + clipElapsed),
                      );
                    }

                    if (event.currentTarget.currentTime >= currentClip.end_time - 0.08) {
                      advanceClip();
                    }
                  }}
                  onEnded={advanceClip}
                />
              ) : null}
              {audioUrl ? (
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  preload="metadata"
                  onLoadedMetadata={(event) => setAudioDuration(event.currentTarget.duration)}
                  onTimeUpdate={(event) => setSequenceElapsed(event.currentTarget.currentTime)}
                  onEnded={() => {
                    primaryVideoRef.current?.pause();
                    secondaryVideoRef.current?.pause();
                    setSequenceElapsed(totalDuration);
                    setIsPlayingSequence(false);
                  }}
                />
              ) : null}

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-14 text-white">
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-emerald-300"
                    style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                  <button
                    className="flex h-9 min-w-16 items-center gap-1.5 rounded-full bg-white px-3 text-neutral-950"
                    type="button"
                    disabled={!canPlaySequence}
                    onClick={() => {
                      if (isPlayingSequence) {
                        stopSequence();
                        return;
                      }

                      if (audioRef.current) {
                        void audioRef.current.play().catch(() => setIsPlayingSequence(false));
                      }
                      setIsPlayingSequence(true);
                    }}
                  >
                    {isPlayingSequence ? <Pause className="size-4" /> : <Play className="size-4" />}
                    {isPlayingSequence ? "Pause" : "Play"}
                  </button>
                  <span className="flex items-center gap-1.5">
                    <Clock3 className="size-4" />
                    {formatTime(sequenceElapsed)} / {formatTime(totalDuration)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                <ListVideo className="size-4 text-emerald-600" />
                {clips.length}/{expectedClips} clip{expectedClips === 1 ? "" : "s"} selected
              </span>
              <span className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500">
                <Clock3 className="size-3.5" />
                {formatTime(totalDuration)}
              </span>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" disabled={!canPlaySequence} onClick={playSequence}>
                <Play className="mr-2 size-4" />
                {isPreloadingClips ? `Loading ${loadedClipCount}/${clips.length}` : "Play final"}
              </Button>
              <Button variant="outline" disabled={!isPlayingSequence} onClick={stopSequence}>
                <Square className="mr-2 size-4" />
                Stop
              </Button>
            </div>

            {currentClip ? (
              <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-neutral-500">
                Now previewing {currentIndex + 1}/{clips.length}: {currentClip.source_basename}{" "}
                {currentClip.start_time_formatted} - {currentClip.end_time_formatted}
              </p>
            ) : null}
            {missingClipCount > 0 ? (
              <p className="m-0 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                {missingClipCount} prompt{missingClipCount === 1 ? "" : "s"} returned no clip, so
                they are not in the final sequence.
              </p>
            ) : null}
          </div>

        {clips.length > 0 ? (
          <div className="grid gap-2">
            {clips.map((clip, index) => (
              <button
                key={`${clip.source_file}-${clip.start_time}-${clip.end_time}-${index}`}
                className={
                  index === currentIndex
                    ? "grid cursor-pointer gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left"
                    : "grid cursor-pointer gap-1 rounded-xl border border-neutral-100 bg-white px-3 py-2 text-left hover:border-neutral-200"
                }
                type="button"
                onClick={() => handleSelectClip(index)}
              >
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-neutral-900">
                  {index + 1}. {clip.source_basename}
                </span>
                <span className="text-xs text-neutral-500">
                  {clip.start_time_formatted} - {clip.end_time_formatted}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
