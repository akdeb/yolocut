import { Caption, createTikTokStyleCaptions } from "@remotion/captions";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AbsoluteFill,
  Audio,
  CalculateMetadataFunction,
  getRemotionEnvironment,
  getStaticFiles,
  OffthreadVideo,
  Sequence,
  useDelayRender,
  useVideoConfig,
  watchStaticFile,
} from "remotion";
import { z } from "zod";
import { loadFont } from "../load-font";
import { NoCaptionFile } from "./NoCaptionFile";
import SubtitlePage from "./SubtitlePage";

export type SubtitleProp = {
  startInSeconds: number;
  text: string;
};

const clipSchema = z.object({
  src: z.string(),
  name: z.string(),
  durationInFrames: z.number().optional(),
  startInSeconds: z.number().optional(),
  endInSeconds: z.number().optional(),
});

export const captionedVideoSchema = z.object({
  clips: z.array(clipSchema).optional(),
  audioSrc: z.string().optional().nullable(),
  audioDurationInSeconds: z.number().optional(),
});

type VideoClip = z.infer<typeof clipSchema>;

const getRemotionEditPayload = async () => {
  try {
    const response = await fetch("http://127.0.0.1:3000/api/remotion-edit");

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as {
      clips?: Array<{
        src: string;
        name: string;
        startInSeconds: number;
        endInSeconds: number;
      }>;
      audioSrc?: string | null;
      audioDurationInSeconds?: number;
    };
  } catch {
    return null;
  }
};

export const calculateCaptionedVideoMetadata: CalculateMetadataFunction<
  z.infer<typeof captionedVideoSchema>
> = async ({ props }) => {
  const fps = 30;
  const editPayload = props.clips && props.clips.length > 0 ? null : await getRemotionEditPayload();
  const payloadClips = editPayload?.clips ?? [];
  const clips =
    props.clips && props.clips.length > 0
      ? props.clips
      : payloadClips.length > 0
        ? payloadClips.map((clip) => ({
            ...clip,
            durationInFrames: Math.max(
              1,
              Math.round((clip.endInSeconds - clip.startInSeconds) * fps),
            ),
          }))
        : [];
  const clipDurationInFrames = clips.reduce(
    (sum, clip) => sum + (clip.durationInFrames ?? 1),
    0,
  );
  const audioSrc = props.audioSrc ?? editPayload?.audioSrc ?? undefined;
  const audioDurationInFrames = Math.ceil(
    (props.audioDurationInSeconds ?? editPayload?.audioDurationInSeconds ?? 0) * fps,
  );

  return {
    fps,
    durationInFrames: Math.max(1, clipDurationInFrames, audioDurationInFrames),
    props: {
      ...props,
      clips,
      audioSrc,
      audioDurationInSeconds:
        props.audioDurationInSeconds ?? editPayload?.audioDurationInSeconds ?? 0,
    },
  };
};

const getFileExists = (file: string) => {
  const files = getStaticFiles();
  const fileExists = files.find((f) => {
    return f.src === file;
  });
  return Boolean(fileExists);
};

// How many captions should be displayed at a time?
// Try out:
// - 1500 to display a lot of words at a time
// - 200 to only display 1 word at a time
const SWITCH_CAPTIONS_EVERY_MS = 1200;
const FINAL_AUDIO_CAPTIONS_FILE = "/final-audio.json";

const getSubtitlesFile = (src: string) => {
  return src
    .replace(/.mp4$/i, ".json")
    .replace(/.mkv$/i, ".json")
    .replace(/.mov$/i, ".json")
    .replace(/.webm$/i, ".json");
};

const offsetCaption = (caption: Caption, offsetMs: number): Caption => {
  return {
    ...caption,
    startMs: caption.startMs + offsetMs,
    endMs: caption.endMs + offsetMs,
    timestampMs:
      caption.timestampMs === null ? null : caption.timestampMs + offsetMs,
  };
};

const StudioCaptionButton: React.FC = () => {
  const { isStudio, isRendering } = getRemotionEnvironment();
  const [status, setStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  if (!isStudio || isRendering || !portalTarget) {
    return null;
  }

  const label =
    status === "running"
      ? "Captioning..."
      : status === "done"
        ? "Captions updated"
        : status === "error"
          ? "Caption failed"
          : "Caption timeline";

  return createPortal(
    <div
      style={{
        alignItems: "center",
        display: "flex",
        height: 42,
        left: 326,
        pointerEvents: "auto",
        position: "fixed",
        top: 0,
        zIndex: 10000,
      }}
    >
      <button
        type="button"
        disabled={status === "running"}
        onClick={async () => {
          setStatus("running");
          try {
            const response = await fetch(
              "http://127.0.0.1:3001/caption-timeline",
              {
                method: "POST",
              },
            );

            if (!response.ok) {
              throw new Error(await response.text());
            }

            setStatus("done");
            window.dispatchEvent(new Event("yolocut:captions-updated"));
          } catch {
            setStatus("error");
          }
        }}
        style={{
          border: 0,
          borderRadius: 6,
          backgroundColor: status === "error" ? "#b42318" : "#2563eb",
          color: "white",
          cursor: status === "running" ? "wait" : "pointer",
          fontFamily: "sans-serif",
          fontSize: 14,
          fontWeight: 700,
          lineHeight: "28px",
          padding: "0 12px",
        }}
      >
        {label}
      </button>
    </div>,
    portalTarget,
  );
};

export const CaptionedVideo: React.FC<{
  clips?: VideoClip[];
  audioSrc?: string | null;
}> = ({ clips = [], audioSrc }) => {
  const [subtitles, setSubtitles] = useState<Caption[]>([]);
  const [missingSubtitleFiles, setMissingSubtitleFiles] = useState<string[]>(
    [],
  );
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender());
  const { fps } = useVideoConfig();

  const timeline = useMemo(() => {
    let cursor = 0;

    return clips.map((clip) => {
      const from = cursor;
      cursor += clip.durationInFrames ?? 1;

      return {
        ...clip,
        from,
        subtitlesFile: getSubtitlesFile(clip.src),
      };
    });
  }, [clips]);

  const fetchSubtitles = useCallback(async () => {
    try {
      await loadFont();

      if (audioSrc) {
        const res = await fetch(`${FINAL_AUDIO_CAPTIONS_FILE}?v=${Date.now()}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          setMissingSubtitleFiles([FINAL_AUDIO_CAPTIONS_FILE]);
          setSubtitles([]);
          continueRender(handle);
          return;
        }

        const captions = (await res.json()) as Caption[];
        setMissingSubtitleFiles([]);
        setSubtitles(captions);
        continueRender(handle);
        return;
      }

      const missingFiles: string[] = [];
      const captionLists = await Promise.all(
        timeline.map(async (clip) => {
          if (!getFileExists(clip.subtitlesFile)) {
            missingFiles.push(clip.subtitlesFile);
            return [];
          }

          const res = await fetch(clip.subtitlesFile);
          const data = (await res.json()) as Caption[];
          const offsetMs = (clip.from / fps) * 1000;
          return data.map((caption) => offsetCaption(caption, offsetMs));
        }),
      );

      setMissingSubtitleFiles(missingFiles);
      setSubtitles(captionLists.flat());
      continueRender(handle);
    } catch {
      setSubtitles([]);
      continueRender(handle);
    }
  }, [audioSrc, continueRender, fps, handle, timeline]);

  useEffect(() => {
    fetchSubtitles();

    const watchers = audioSrc
      ? [
          watchStaticFile(FINAL_AUDIO_CAPTIONS_FILE, () => {
            fetchSubtitles();
          }),
        ]
      : timeline.map((clip) =>
          watchStaticFile(clip.subtitlesFile, () => {
            fetchSubtitles();
          }),
        );

    return () => {
      watchers.forEach((watcher) => watcher.cancel());
    };
  }, [audioSrc, fetchSubtitles, timeline]);

  useEffect(() => {
    const handleCaptionsUpdated = () => {
      fetchSubtitles();
    };

    window.addEventListener("yolocut:captions-updated", handleCaptionsUpdated);

    return () => {
      window.removeEventListener("yolocut:captions-updated", handleCaptionsUpdated);
    };
  }, [fetchSubtitles]);

  const { pages } = useMemo(() => {
    return createTikTokStyleCaptions({
      combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
      captions: subtitles ?? [],
    });
  }, [subtitles]);

  return (
    <AbsoluteFill style={{ backgroundColor: "white" }}>
      <StudioCaptionButton />
      {timeline.length === 0 ? (
        <AbsoluteFill
          style={{
            alignItems: "center",
            backgroundColor: "#0a0a0a",
            color: "white",
            display: "flex",
            fontFamily: "sans-serif",
            fontSize: 44,
            fontWeight: 800,
            justifyContent: "center",
            padding: 80,
            textAlign: "center",
          }}
        >
          Click Edit in YOLOCUT to load the selected clips and audio.
        </AbsoluteFill>
      ) : null}
      {timeline.map((clip) => (
        <Sequence
          key={`${clip.src}-${clip.from}`}
          from={clip.from}
          durationInFrames={clip.durationInFrames ?? 1}
        >
          <OffthreadVideo
            style={{
              objectFit: "cover",
            }}
            src={clip.src}
            startFrom={Math.round((clip.startInSeconds ?? 0) * fps)}
          />
        </Sequence>
      ))}
      {audioSrc ? <Audio src={audioSrc} /> : null}
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const subtitleStartFrame = Math.floor((page.startMs / 1000) * fps);
        const maxSubtitleEndFrame =
          subtitleStartFrame + Math.ceil((SWITCH_CAPTIONS_EVERY_MS / 1000) * fps);
        const subtitleEndFrame = Math.ceil(Math.min(
          nextPage ? (nextPage.startMs / 1000) * fps : Infinity,
          maxSubtitleEndFrame,
        ));
        const durationInFrames = subtitleEndFrame - subtitleStartFrame;
        if (durationInFrames <= 0) {
          return null;
        }

        return (
          <Sequence
            key={`caption-${index}-${subtitleStartFrame}`}
            name={`caption ${index + 1}`}
            from={subtitleStartFrame}
            durationInFrames={durationInFrames}
          >
            <SubtitlePage key={index} page={page} />;
          </Sequence>
        );
      })}
      {missingSubtitleFiles.length === 0 ? null : (
        <NoCaptionFile missingCount={missingSubtitleFiles.length} />
      )}
    </AbsoluteFill>
  );
};
