import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  WHISPER_LANG,
  WHISPER_MODEL,
  WHISPER_PATH,
  WHISPER_VERSION,
} from "./whisper-config.mjs";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";

const finalAudioPath = path.join(process.cwd(), ".yolocut", "final-audio.mp3");
const tempDirectory = path.join(process.cwd(), "temp");
const tempWavPath = path.join(tempDirectory, "final-audio.wav");
const captionsPath = path.join(process.cwd(), "public", "final-audio.json");

if (!existsSync(finalAudioPath)) {
  throw new Error("No final audio found at .yolocut/final-audio.mp3");
}

mkdirSync(tempDirectory, { recursive: true });

try {
  await installWhisperCpp({ to: WHISPER_PATH, version: WHISPER_VERSION });
  await downloadWhisperModel({ folder: WHISPER_PATH, model: WHISPER_MODEL });

  execSync(`npx remotion ffmpeg -i "${finalAudioPath}" -ar 16000 "${tempWavPath}" -y`, {
    stdio: ["ignore", "inherit"],
  });

  const whisperCppOutput = await transcribe({
    inputPath: tempWavPath,
    model: WHISPER_MODEL,
    tokenLevelTimestamps: true,
    whisperPath: WHISPER_PATH,
    whisperCppVersion: WHISPER_VERSION,
    printOutput: false,
    translateToEnglish: false,
    language: WHISPER_LANG,
    splitOnWord: true,
  });

  const { captions } = toCaptions({ whisperCppOutput });
  writeFileSync(captionsPath, JSON.stringify(captions, null, 2));
  console.log(`Wrote final audio captions to ${captionsPath}`);
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
