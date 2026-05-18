/* eslint-disable @remotion/warn-native-media-tag */

import { Clock3, Film, ListVideo, Pause, Play, Scissors, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../src/components/ui/button";
import { Card } from "../../src/components/ui/card";
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

export const FinalVideo = ({ clips, apiBaseUrl, expectedClipCount, audioUrl }: FinalVideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const nextVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [sequenceElapsed, setSequenceElapsed] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  const currentClip = clips[currentIndex] ?? null;
  const nextClip = clips[currentIndex + 1] ?? null;
  const currentClipUrl = currentClip ? resolveSourceUrl(currentClip, apiBaseUrl) : null;
  const nextClipUrl = nextClip ? resolveSourceUrl(nextClip, apiBaseUrl) : null;
  const expectedClips = Math.max(expectedClipCount, clips.length);
  const missingClipCount = Math.max(0, expectedClips - clips.length);
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

  const playSequence = () => {
    if (clips.length === 0 && !audioUrl) {
      return;
    }

    setCurrentIndex(0);
    setSequenceElapsed(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => setIsPlayingSequence(false));
    }
    setIsPlayingSequence(true);
  };

  const stopSequence = () => {
    videoRef.current?.pause();
    audioRef.current?.pause();
    setIsPlayingSequence(false);
  };

  const advanceClip = () => {
    if (currentIndex < clips.length - 1) {
      const nextIndex = currentIndex + 1;
      const nextElapsed = clips
        .slice(0, nextIndex)
        .reduce((duration, clip) => duration + getClipDuration(clip), 0);

      setSequenceElapsed(nextElapsed);
      setCurrentIndex(nextIndex);
      return;
    }

    videoRef.current?.pause();
    setCurrentIndex(clips.length);
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
    setSequenceElapsed(elapsed);
  };

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !currentClip || !currentClipUrl) {
      return;
    }

    if (video.getAttribute("src") !== currentClipUrl) {
      video.setAttribute("src", currentClipUrl);
      video.load();
      return;
    }

    video.currentTime = currentClip.start_time;
    if (isPlayingSequence) {
      void video.play().catch(() => setIsPlayingSequence(false));
    }
  }, [currentClip, currentClipUrl, isPlayingSequence]);

  useEffect(() => {
    setCurrentIndex(0);
    setSequenceElapsed(0);
    setIsPlayingSequence(false);
  }, [clips]);

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
          <h2 className="m-0 mt-2 font-serif text-3xl font-bold tracking-[-0.035em] text-neutral-950">
            Selected sequence
          </h2>
          <p className="m-0 mt-2 text-sm leading-6 text-neutral-500">
            Plays the selected clip from each prompt in order using the matched source ranges.
          </p>
        </div>

        <Card className="overflow-hidden">
          <div className="relative aspect-video bg-neutral-950">
            {currentClip && currentClipUrl ? (
              <video
                ref={videoRef}
                className="size-full object-cover"
                preload="metadata"
                muted
                playsInline
                onLoadedMetadata={() => {
                  if (videoRef.current && currentClip) {
                    videoRef.current.currentTime = currentClip.start_time;
                    if (isPlayingSequence) {
                      void videoRef.current.play().catch(() => setIsPlayingSequence(false));
                    }
                  }
                }}
                onTimeUpdate={(event) => {
                  const clipElapsed = Math.max(0, event.currentTarget.currentTime - currentClip.start_time);
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
                  : "Select search results to preview the stitched sequence."}
              </div>
            )}
            {nextClipUrl ? <video ref={nextVideoRef} className="hidden" src={nextClipUrl} preload="auto" muted /> : null}
            {audioUrl ? (
              <audio
                ref={audioRef}
                src={audioUrl}
                preload="metadata"
                onLoadedMetadata={(event) => setAudioDuration(event.currentTarget.duration)}
                onTimeUpdate={(event) => setSequenceElapsed(event.currentTarget.currentTime)}
                onEnded={() => {
                  videoRef.current?.pause();
                  setSequenceElapsed(totalDuration);
                  setIsPlayingSequence(false);
                }}
              />
            ) : null}

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10 text-white">
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-emerald-300"
                  style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-sm font-semibold">
                <button
                  className="flex h-9 min-w-16 items-center gap-1.5 rounded-full bg-white px-3 text-neutral-950"
                  type="button"
                  disabled={clips.length === 0 && !audioUrl}
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
              <Button className="flex-1" disabled={clips.length === 0 && !audioUrl} onClick={playSequence}>
                <Play className="mr-2 size-4" />
                Play final
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
        </Card>

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
