/* eslint-disable @remotion/warn-native-media-tag */

import { Clock3, Film, ListVideo, Loader2, Pause, Play, Scissors, Square } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "../../src/components/ui/button";
import { type SearchClipResult, resolveSourceUrl } from "./Search";

export type FinalVideoHandle = {
  exportVideo: () => Promise<void>;
};

type FinalVideoProps = {
  clips: SearchClipResult[];
  apiBaseUrl: string;
  expectedClipCount: number;
  audioUrl: string;
  musicUrl?: string;
  captions?: CaptionToken[];
  showDetails?: boolean;
  showHeader?: boolean;
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

export type CaptionToken = {
  text: string;
  startMs: number;
  endMs: number;
};

type CaptionPage = {
  startMs: number;
  endMs: number;
  tokens: CaptionToken[];
};

const SWITCH_CAPTIONS_EVERY_MS = 1200;
const CAPTION_HIGHLIGHT_COLOR = "#39E508";
const MUSIC_VOLUME = 0.1;
const EXPORT_WIDTH = 1080;
const EXPORT_HEIGHT = 1920;
const EXPORT_FPS = 30;
const EXPORT_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

// Group word-level captions into TikTok-style pages.
const buildCaptionPages = (captions: CaptionToken[]): CaptionPage[] => {
  const pages: CaptionPage[] = [];

  for (const caption of captions) {
    const current = pages[pages.length - 1];

    if (!current || caption.startMs - current.startMs >= SWITCH_CAPTIONS_EVERY_MS) {
      pages.push({ startMs: caption.startMs, endMs: caption.endMs, tokens: [caption] });
    } else {
      current.tokens.push(caption);
      current.endMs = caption.endMs;
    }
  }

  return pages;
};

const getActiveCaptionPageIndex = (pages: CaptionPage[], elapsedMs: number) => {
  if (pages.length === 0) {
    return -1;
  }

  let index = -1;
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    if (pages[pageIndex].startMs <= elapsedMs) {
      index = pageIndex;
    } else {
      break;
    }
  }

  if (index === -1) {
    return -1;
  }

  const page = pages[index];
  const nextPage = pages[index + 1];
  const visibleUntilMs = nextPage ? nextPage.startMs : page.endMs + 700;

  return elapsedMs < visibleUntilMs ? index : -1;
};

const pickExportMimeType = () => {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return EXPORT_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
};

export const FinalVideo = forwardRef<FinalVideoHandle, FinalVideoProps>(function FinalVideo(
  {
    clips,
    apiBaseUrl,
    expectedClipCount,
    audioUrl,
    musicUrl = "",
    captions = [],
    showDetails = true,
    showHeader = true,
  },
  ref,
) {
  const primaryVideoRef = useRef<HTMLVideoElement>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [sequenceElapsed, setSequenceElapsed] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const activeSlotRef = useRef<0 | 1>(0);
  const currentIndexRef = useRef(0);
  const isPlayingSequenceRef = useRef(false);
  const sequenceElapsedRef = useRef(0);
  const isExportingRef = useRef(false);
  // When seeking, the active video must resume at an offset instead of the
  // clip start; cleared once playback advances past the clip.
  const seekTargetRef = useRef<{ index: number; time: number } | null>(null);
  // Web Audio graph used to mux voiceover + music into the exported file.
  const audioGraphRef = useRef<{
    context: AudioContext;
    destination: MediaStreamAudioDestinationNode;
  } | null>(null);

  const currentClip = clips[currentIndex] ?? null;
  const currentClipUrl = currentClip ? resolveSourceUrl(currentClip, apiBaseUrl) : null;
  const expectedClips = Math.max(expectedClipCount, clips.length);
  const missingClipCount = Math.max(0, expectedClips - clips.length);
  const clipUrls = useMemo(() => {
    return clips.map((clip) => resolveSourceUrl(clip, apiBaseUrl));
  }, [apiBaseUrl, clips]);
  const clipKeys = useMemo(() => {
    return clips.map(
      (clip, index) => `${clip.source_file}-${clip.start_time}-${clip.end_time}-${index}`,
    );
  }, [clips]);
  const canPlaySequence = clips.length > 0 || Boolean(audioUrl);
  const brollDuration = useMemo(() => {
    return clips.reduce((duration, clip) => duration + getClipDuration(clip), 0);
  }, [clips]);
  const totalDuration = audioDuration || brollDuration;
  const elapsedBeforeCurrentClip = useMemo(() => {
    return clips
      .slice(0, currentIndex)
      .reduce((duration, clip) => duration + getClipDuration(clip), 0);
  }, [clips, currentIndex]);
  const progressPercent =
    totalDuration > 0
      ? Math.max(0, Math.min(100, (sequenceElapsed / totalDuration) * 100))
      : 0;

  const captionPages = useMemo(() => buildCaptionPages(captions), [captions]);
  const activeCaptionPageIndex = useMemo(
    () => getActiveCaptionPageIndex(captionPages, sequenceElapsed * 1000),
    [captionPages, sequenceElapsed],
  );
  const activeCaptionPage =
    activeCaptionPageIndex === -1 ? null : captionPages[activeCaptionPageIndex];

  const getVideoElement = useCallback((slot: 0 | 1) => {
    return slot === 0 ? primaryVideoRef.current : secondaryVideoRef.current;
  }, []);

  const prepareVideo = useCallback(
    (slot: 0 | 1, clipIndex: number) => {
      const video = getVideoElement(slot);
      const clip = clips[clipIndex];
      const clipKey = clipKeys[clipIndex];
      const clipUrl = clipUrls[clipIndex];

      if (!video || !clip || !clipKey || !clipUrl) {
        if (video) {
          video.removeAttribute("src");
          video.removeAttribute("data-clip-key");
          video.removeAttribute("data-clip-index");
          video.load();
        }
        return;
      }

      // Only (re)load when the slot switches clips. The source streams over
      // HTTP range requests, so the browser fetches only the bytes it plays.
      if (video.dataset.clipKey !== clipKey) {
        video.dataset.clipKey = clipKey;
        video.dataset.clipIndex = String(clipIndex);
        video.src = clipUrl;
        video.load();
      }
    },
    [clipKeys, clipUrls, clips, getVideoElement],
  );

  const locateClip = useCallback(
    (targetSeconds: number) => {
      let accumulated = 0;

      for (let index = 0; index < clips.length; index += 1) {
        const duration = getClipDuration(clips[index]);

        if (targetSeconds < accumulated + duration) {
          return { index, within: targetSeconds - accumulated };
        }

        accumulated += duration;
      }

      const lastIndex = Math.max(0, clips.length - 1);
      const lastClip = clips[lastIndex];

      return { index: lastIndex, within: lastClip ? getClipDuration(lastClip) : 0 };
    },
    [clips],
  );

  const seekTo = (targetSeconds: number) => {
    if (totalDuration <= 0) {
      return;
    }

    const clamped = Math.max(0, Math.min(totalDuration, targetSeconds));
    setSequenceElapsed(clamped);

    if (audioRef.current) {
      audioRef.current.currentTime = clamped;
    }

    if (musicRef.current) {
      musicRef.current.currentTime = clamped;
    }

    if (clips.length === 0) {
      return;
    }

    const { index, within } = locateClip(Math.min(clamped, brollDuration));
    const clip = clips[index];

    if (!clip) {
      return;
    }

    const desiredTime = clip.start_time + within;
    seekTargetRef.current = { index, time: desiredTime };
    currentIndexRef.current = index;
    activeSlotRef.current = 0;
    setActiveSlot(0);
    setCurrentIndex(index);
    prepareVideo(0, index);
    prepareVideo(1, index + 1);

    const activeVideo = getVideoElement(0);
    if (
      activeVideo &&
      activeVideo.dataset.clipIndex === String(index) &&
      activeVideo.readyState >= HTMLMediaElement.HAVE_METADATA
    ) {
      activeVideo.currentTime = desiredTime;
    }
  };

  const resumePlayback = () => {
    if (!canPlaySequence) {
      return;
    }

    if (audioRef.current) {
      void audioRef.current.play().catch(() => setIsPlayingSequence(false));
    }

    if (musicRef.current) {
      void musicRef.current.play().catch(() => undefined);
    }

    const activeVideo = getVideoElement(activeSlotRef.current);
    if (activeVideo) {
      void activeVideo.play().catch(() => undefined);
    }

    setIsPlayingSequence(true);
  };

  const stopSequence = () => {
    primaryVideoRef.current?.pause();
    secondaryVideoRef.current?.pause();
    audioRef.current?.pause();
    musicRef.current?.pause();
    setIsPlayingSequence(false);
  };

  const togglePlay = () => {
    if (!canPlaySequence || isExporting) {
      return;
    }

    if (isPlayingSequence) {
      stopSequence();
      return;
    }

    if (totalDuration > 0 && sequenceElapsed >= totalDuration - 0.15) {
      seekTo(0);
    }

    resumePlayback();
  };

  const playSequence = () => {
    if (!canPlaySequence) {
      return;
    }

    seekTargetRef.current = null;
    prepareVideo(0, 0);
    prepareVideo(1, 1);
    activeSlotRef.current = 0;
    currentIndexRef.current = 0;
    setActiveSlot(0);
    setCurrentIndex(0);
    setSequenceElapsed(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    if (musicRef.current) {
      musicRef.current.currentTime = 0;
    }
    resumePlayback();
  };

  const getSeekSeconds = (clientX: number) => {
    const track = scrubRef.current;

    if (!track || totalDuration <= 0) {
      return 0;
    }

    const rect = track.getBoundingClientRect();
    const fraction = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;

    return Math.max(0, Math.min(1, fraction)) * totalDuration;
  };

  const handleScrubStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (totalDuration <= 0 || isExporting) {
      return;
    }

    event.preventDefault();
    const wasPlaying = isPlayingSequenceRef.current;

    stopSequence();
    seekTo(getSeekSeconds(event.clientX));

    const handleMove = (moveEvent: PointerEvent) => {
      seekTo(getSeekSeconds(moveEvent.clientX));
    };

    const handleUp = (upEvent: PointerEvent) => {
      seekTo(getSeekSeconds(upEvent.clientX));
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);

      if (wasPlaying) {
        resumePlayback();
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const advanceClip = () => {
    seekTargetRef.current = null;
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
      if (!audioUrl) {
        setSequenceElapsed(nextElapsed);
      }
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
    sequenceElapsedRef.current = sequenceElapsed;
  }, [sequenceElapsed]);

  useEffect(() => {
    if (musicRef.current && !audioGraphRef.current) {
      musicRef.current.volume = MUSIC_VOLUME;
    }
  }, [musicUrl]);

  // Drive the playback clock at 60fps from the audio element so the scrubber
  // and per-word caption highlight stay smooth (timeupdate only fires ~4x/sec).
  useEffect(() => {
    if (!isPlayingSequence || !audioUrl) {
      return;
    }

    let frame = 0;
    const tick = () => {
      if (audioRef.current) {
        setSequenceElapsed(audioRef.current.currentTime);
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [isPlayingSequence, audioUrl]);

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
    seekTargetRef.current = null;
    setCurrentIndex(0);
    setActiveSlot(0);
    setSequenceElapsed(0);
    setIsPlayingSequence(false);
  }, [clips]);

  useEffect(() => {
    setAudioDuration(0);
    setSequenceElapsed(0);
    setIsPlayingSequence(false);
  }, [audioUrl]);

  const ensureAudioGraph = useCallback(() => {
    if (audioGraphRef.current) {
      return audioGraphRef.current;
    }

    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("Audio export is not supported in this browser");
    }

    const context = new AudioContextClass();
    const destination = context.createMediaStreamDestination();

    if (audioRef.current) {
      const voiceSource = context.createMediaElementSource(audioRef.current);
      voiceSource.connect(destination);
      voiceSource.connect(context.destination);
    }

    if (musicRef.current) {
      // The element volume is reset to 1 so the gain node is the single source
      // of truth for the 10% music level (in preview and in the export).
      musicRef.current.volume = 1;
      const musicSource = context.createMediaElementSource(musicRef.current);
      const musicGain = context.createGain();
      musicGain.gain.value = MUSIC_VOLUME;
      musicSource.connect(musicGain);
      musicGain.connect(destination);
      musicGain.connect(context.destination);
    }

    audioGraphRef.current = { context, destination };
    return audioGraphRef.current;
  }, []);

  const drawExportFrame = useCallback(
    (context: CanvasRenderingContext2D) => {
      context.fillStyle = "#0a0a0a";
      context.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

      const video = getVideoElement(activeSlotRef.current);
      if (video && video.videoWidth > 0 && video.readyState >= 2) {
        const scale = Math.max(
          EXPORT_WIDTH / video.videoWidth,
          EXPORT_HEIGHT / video.videoHeight,
        );
        const drawWidth = video.videoWidth * scale;
        const drawHeight = video.videoHeight * scale;
        try {
          context.drawImage(
            video,
            (EXPORT_WIDTH - drawWidth) / 2,
            (EXPORT_HEIGHT - drawHeight) / 2,
            drawWidth,
            drawHeight,
          );
        } catch {
          // A not-yet-decodable frame can throw; skip it.
        }
      }

      const elapsedMs = (audioRef.current?.currentTime ?? sequenceElapsedRef.current) * 1000;
      const pageIndex = getActiveCaptionPageIndex(captionPages, elapsedMs);
      if (pageIndex === -1) {
        return;
      }

      const tokens = captionPages[pageIndex].tokens.map((token) => ({
        text: token.text.toUpperCase(),
        active: token.startMs <= elapsedMs && token.endMs > elapsedMs,
      }));

      let fontSize = 96;
      const maxWidth = EXPORT_WIDTH * 0.86;
      context.font = `${fontSize}px "TheBoldFont", sans-serif`;
      let totalWidth = tokens.reduce(
        (width, token) => width + context.measureText(token.text).width,
        0,
      );

      if (totalWidth > maxWidth) {
        fontSize = Math.max(44, fontSize * (maxWidth / totalWidth));
        context.font = `${fontSize}px "TheBoldFont", sans-serif`;
        totalWidth = tokens.reduce(
          (width, token) => width + context.measureText(token.text).width,
          0,
        );
      }

      context.textAlign = "left";
      context.textBaseline = "middle";
      context.lineJoin = "round";
      context.lineWidth = fontSize * 0.18;
      context.strokeStyle = "#000000";

      let cursorX = (EXPORT_WIDTH - totalWidth) / 2;
      const baselineY = EXPORT_HEIGHT * 0.74;

      for (const token of tokens) {
        context.strokeText(token.text, cursorX, baselineY);
        context.fillStyle = token.active ? CAPTION_HIGHLIGHT_COLOR : "#ffffff";
        context.fillText(token.text, cursorX, baselineY);
        cursorX += context.measureText(token.text).width;
      }
    },
    [captionPages, getVideoElement],
  );

  const waitForPlaybackEnd = useCallback(() => {
    return new Promise<void>((resolve) => {
      const startedAt = Date.now();
      const hardCapMs = (totalDuration + 12) * 1000;

      const timer = window.setInterval(() => {
        const audio = audioRef.current;
        const reachedEnd = audio
          ? audio.ended || (totalDuration > 0 && audio.currentTime >= totalDuration - 0.08)
          : !isPlayingSequenceRef.current && sequenceElapsedRef.current >= totalDuration - 0.1;

        if (reachedEnd || Date.now() - startedAt > hardCapMs) {
          window.clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  }, [totalDuration]);

  const exportVideo = async () => {
    if (isExportingRef.current || !canPlaySequence) {
      return;
    }

    isExportingRef.current = true;
    setIsExporting(true);

    let drawHandle = 0;
    let recorder: MediaRecorder | null = null;

    try {
      const graph = ensureAudioGraph();
      if (graph.context.state === "suspended") {
        await graph.context.resume();
      }

      const canvas = document.createElement("canvas");
      canvas.width = EXPORT_WIDTH;
      canvas.height = EXPORT_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas export is not supported in this browser");
      }

      const canvasStream = canvas.captureStream(EXPORT_FPS);
      const exportStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...graph.destination.stream.getAudioTracks(),
      ]);

      const mimeType = pickExportMimeType();
      recorder = new MediaRecorder(exportStream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      const recorderStopped = new Promise<void>((resolve) => {
        if (recorder) {
          recorder.onstop = () => resolve();
        }
      });

      seekTo(0);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

      const draw = () => {
        drawExportFrame(context);
        drawHandle = window.requestAnimationFrame(draw);
      };
      drawHandle = window.requestAnimationFrame(draw);

      recorder.start();
      resumePlayback();

      await waitForPlaybackEnd();

      window.cancelAnimationFrame(drawHandle);
      drawHandle = 0;
      recorder.stop();
      await recorderStopped;
      stopSequence();

      const blob = new Blob(chunks, { type: mimeType || "video/webm" });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = "yolocut-cut.webm";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
    } finally {
      if (drawHandle) {
        window.cancelAnimationFrame(drawHandle);
      }
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      isExportingRef.current = false;
      setIsExporting(false);
    }
  };

  useImperativeHandle(ref, () => ({ exportVideo }));

  const renderClipVideo = (slot: 0 | 1, videoRef: React.RefObject<HTMLVideoElement | null>) => {
    const endThreshold = slot === 0 ? 0.03 : 0.08;

    return (
      <video
        ref={videoRef}
        className={
          activeSlot === slot
            ? "absolute inset-0 size-full bg-neutral-950 object-cover opacity-100"
            : "absolute inset-0 size-full bg-neutral-950 object-cover opacity-0"
        }
        preload="auto"
        muted
        playsInline
        onLoadedMetadata={(event) => {
          const clipIndex = Number(event.currentTarget.dataset.clipIndex ?? "-1");
          const loadedClip = clips[clipIndex];
          if (!loadedClip) {
            return;
          }

          const seekTarget = seekTargetRef.current;
          event.currentTarget.currentTime =
            seekTarget && seekTarget.index === clipIndex
              ? seekTarget.time
              : loadedClip.start_time;

          if (activeSlot === slot && isPlayingSequence) {
            void event.currentTarget.play().catch(() => setIsPlayingSequence(false));
          }
        }}
        onWaiting={() => {
          if (activeSlot === slot && isPlayingSequenceRef.current) {
            setIsBuffering(true);
          }
        }}
        onPlaying={() => {
          if (activeSlot === slot) {
            setIsBuffering(false);
          }
        }}
        onCanPlay={() => {
          if (activeSlot === slot) {
            setIsBuffering(false);
          }
        }}
        onTimeUpdate={(event) => {
          if (activeSlot !== slot || !currentClip) {
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

          if (event.currentTarget.currentTime >= currentClip.end_time - endThreshold) {
            advanceClip();
          }
        }}
        onEnded={advanceClip}
      />
    );
  };

  return (
    <div className="grid justify-items-center gap-5">
      <div className="grid justify-items-center">
        {showHeader ? (
        <div className="w-full">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-emerald-500">
            <Scissors className="size-4" />
            <span>Final video</span>
          </div>
        </div>
        ) : null}

          <div className={showDetails ? "relative w-full max-w-[310px] rounded-[2.35rem] border-[10px] border-neutral-950 bg-neutral-950 p-1 shadow-2xl" : "relative w-[300px] max-w-full rounded-[2.55rem] border-[11px] border-neutral-950 bg-neutral-950 p-1.5 shadow-2xl"}>
            <div className="absolute left-1/2 top-2 z-40 h-5 w-24 -translate-x-1/2 rounded-full bg-neutral-950" />
            <div className={showDetails ? "relative aspect-[9/16] overflow-hidden rounded-[1.55rem] bg-neutral-950" : "relative aspect-[9/16] overflow-hidden rounded-[2rem] bg-neutral-950"}>
              {currentClip && currentClipUrl ? (
                renderClipVideo(0, primaryVideoRef)
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
              {currentClip && currentClipUrl ? renderClipVideo(1, secondaryVideoRef) : null}
              {audioUrl ? (
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  preload="auto"
                  onLoadedMetadata={(event) => setAudioDuration(event.currentTarget.duration)}
                  onTimeUpdate={(event) => {
                    if (!isPlayingSequenceRef.current) {
                      setSequenceElapsed(event.currentTarget.currentTime);
                    }
                  }}
                  onEnded={() => {
                    primaryVideoRef.current?.pause();
                    secondaryVideoRef.current?.pause();
                    musicRef.current?.pause();
                    setSequenceElapsed(totalDuration);
                    setIsPlayingSequence(false);
                  }}
                />
              ) : null}
              {musicUrl ? (
                <audio ref={musicRef} src={musicUrl} preload="auto" />
              ) : null}

              <button
                type="button"
                className="absolute inset-0 z-10 flex items-center justify-center outline-none"
                disabled={!canPlaySequence || isExporting}
                aria-label={isPlayingSequence ? "Pause" : "Play"}
                onClick={togglePlay}
              >
                <span
                  className={
                    isPlayingSequence && !isBuffering
                      ? "flex size-[72px] scale-75 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur-[2px] transition-all duration-200"
                      : "flex size-[72px] scale-100 items-center justify-center rounded-full bg-black/45 text-white opacity-100 backdrop-blur-[2px] transition-all duration-200"
                  }
                >
                  {isBuffering ? (
                    <Loader2 className="size-8 animate-spin" />
                  ) : isPlayingSequence ? (
                    <Pause className="size-9" fill="currentColor" />
                  ) : (
                    <Play className="size-9 translate-x-[3px]" fill="currentColor" />
                  )}
                </span>
              </button>

              {activeCaptionPage ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-[24%] z-20 flex justify-center px-3">
                  <div
                    key={activeCaptionPageIndex}
                    style={{
                      animation: "caption-pop 200ms cubic-bezier(0.22, 1, 0.36, 1) both",
                      fontFamily: '"TheBoldFont", system-ui, sans-serif',
                      fontSize: 30,
                      lineHeight: 1.05,
                      maxWidth: "92%",
                      textAlign: "center",
                      textTransform: "uppercase",
                      color: "white",
                      WebkitTextStroke: "6px #000",
                      paintOrder: "stroke",
                      textShadow: "0 3px 12px rgba(0,0,0,0.55)",
                    }}
                  >
                    {activeCaptionPage.tokens.map((token, index) => {
                      const elapsedMs = sequenceElapsed * 1000;
                      const isActive =
                        token.startMs <= elapsedMs && token.endMs > elapsedMs;

                      return (
                        <span
                          key={`${token.startMs}-${index}`}
                          style={{ color: isActive ? CAPTION_HIGHLIGHT_COLOR : "white" }}
                        >
                          {token.text}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-3 pt-12">
                <div className="flex items-center gap-2 text-[11px] font-semibold tabular-nums text-white">
                  <span>{formatTime(sequenceElapsed)}</span>
                  <div
                    ref={scrubRef}
                    className="relative flex h-5 flex-1 cursor-pointer touch-none items-center"
                    onPointerDown={handleScrubStart}
                  >
                    <div className="h-[3px] w-full rounded-full bg-white/30">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span
                      className="absolute size-3 -translate-x-1/2 rounded-full bg-white shadow-[0_0_6px_rgba(0,0,0,0.65)]"
                      style={{ left: `${progressPercent}%` }}
                    />
                  </div>
                  <span>{formatTime(totalDuration)}</span>
                </div>
              </div>

              {isExporting ? (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 text-white">
                  <Loader2 className="size-8 animate-spin" />
                  <span className="font-playfair text-sm font-semibold">
                    Exporting video...
                  </span>
                  <span className="px-8 text-center text-xs text-white/70">
                    Recording the cut in real time. Keep this tab open.
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {showDetails ? (
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
          ) : null}

        {showDetails && clips.length > 0 ? (
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
});
