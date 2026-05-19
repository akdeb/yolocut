/* eslint-disable @remotion/warn-native-media-tag */

import { AlertCircle, Loader2, Volume2 } from "lucide-react";

type FinalAudioProps = {
  audioUrl: string;
  isGenerating: boolean;
  error: string;
  onDurationChange: (durationInSeconds: number) => void;
};

export const FinalAudio = ({
  audioUrl,
  isGenerating,
  error,
  onDurationChange,
}: FinalAudioProps) => {
  return (
    <div className="grid gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-emerald-500">
          <Volume2 className="size-4" />
          <span>Final audio</span>
        </div>
      </div>

        {isGenerating ? (
          <div className="flex items-center gap-3 text-sm font-medium text-neutral-600">
            <Loader2 className="size-5 animate-spin text-emerald-600" />
            Generating ElevenLabs voiceover...
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">
            <AlertCircle className="mt-0.5 size-5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : audioUrl ? (
          <audio
            className="w-full"
            src={audioUrl}
            controls
            onLoadedMetadata={(event) => onDurationChange(event.currentTarget.duration)}
          />
        ) : (
          <p className="m-0 text-sm text-neutral-500">
            Create a search to generate the concatenated transcript voiceover.
          </p>
        )}
    </div>
  );
};
