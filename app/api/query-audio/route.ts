import { put } from "@vercel/blob";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ELEVENLABS_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
const ELEVENLABS_TEXT_TO_SPEECH_URL = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;
const SESSION_COOKIE = "yolocut_session";
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://orjrkzierhpmkamhwejb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_RZ3yKF9mu4azumK5FkbDZg_ogc7SaRO";

type QueryAudioRequest = {
  query_id?: string;
  transcript?: string;
};

const getAudioPathname = (userId: string, queryId: string) => {
  return `${userId}_audio/${queryId}.mp3`;
};

export const POST = async (request: Request) => {
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!elevenLabsApiKey) {
    return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 500 });
  }

  if (!blobToken) {
    return NextResponse.json({ error: "Missing BLOB_READ_WRITE_TOKEN" }, { status: 500 });
  }

  const body = (await request.json()) as QueryAudioRequest;
  const queryId = body.query_id?.trim();
  const transcript = body.transcript?.trim();

  if (!queryId || !transcript) {
    return NextResponse.json(
      { error: "query_id and transcript are required" },
      { status: 400 },
    );
  }

  const audioResponse = await fetch(ELEVENLABS_TEXT_TO_SPEECH_URL, {
    method: "POST",
    headers: {
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": elevenLabsApiKey,
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

  if (!audioResponse.ok) {
    const detail = await audioResponse.text();
    return NextResponse.json(
      { error: detail || "Failed to generate final audio" },
      { status: audioResponse.status },
    );
  }

  const audio = Buffer.from(await audioResponse.arrayBuffer());
  const pathname = getAudioPathname(userId, queryId);
  const blob = await put(pathname, audio, {
    access: "private",
    allowOverwrite: true,
    contentType: "audio/mpeg",
    token: blobToken,
  });

  const updateResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/queries?query_id=eq.${encodeURIComponent(queryId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ audio_url: blob.url }),
    },
  );

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    return NextResponse.json(
      { error: errorText || "Failed to update query audio_url" },
      { status: updateResponse.status },
    );
  }

  return NextResponse.json({
    audio_url: blob.url,
    stream_url: `/api/query-audio-stream?pathname=${encodeURIComponent(pathname)}`,
  });
};
