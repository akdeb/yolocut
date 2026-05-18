import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ELEVENLABS_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
const ELEVENLABS_TEXT_TO_SPEECH_URL = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;
const FINAL_AUDIO_PATH = path.join(process.cwd(), ".yolocut", "final-audio.mp3");
const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

export const runtime = "nodejs";

type FinalAudioRequest = {
  transcript?: string;
};

export const POST = async (request: Request) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ELEVENLABS_API_KEY in .env.local" },
      { headers: CORS_HEADERS, status: 500 },
    );
  }

  const body = (await request.json()) as FinalAudioRequest;
  const transcript = body.transcript?.trim();

  if (!transcript) {
    return NextResponse.json(
      { error: "Transcript is required" },
      { headers: CORS_HEADERS, status: 400 },
    );
  }

  const response = await fetch(ELEVENLABS_TEXT_TO_SPEECH_URL, {
    method: "POST",
    headers: {
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text: transcript,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();

    return NextResponse.json(
      { error: detail || "Failed to generate final audio" },
      { headers: CORS_HEADERS, status: response.status },
    );
  }

  const audio = await response.arrayBuffer();
  await mkdir(path.dirname(FINAL_AUDIO_PATH), { recursive: true });
  await writeFile(FINAL_AUDIO_PATH, Buffer.from(audio));

  return new Response(audio, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
};

export const GET = async () => {
  try {
    const audio = await readFile(FINAL_AUDIO_PATH);

    return new Response(audio, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No final audio has been generated yet" },
      { headers: CORS_HEADERS, status: 404 },
    );
  }
};

export const OPTIONS = () => {
  return new Response(null, { headers: CORS_HEADERS });
};
