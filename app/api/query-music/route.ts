import { put } from "@vercel/blob";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SESSION_COOKIE = "yolocut_session";
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://orjrkzierhpmkamhwejb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_RZ3yKF9mu4azumK5FkbDZg_ogc7SaRO";
const ELEVENLABS_MUSIC_URL =
  "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128";
const MUSIC_PROMPT =
  "Upbeat ad creative music for a health brand with no vocals";
// The ElevenLabs music endpoint only accepts lengths between 3s and 10min.
const MIN_MUSIC_MS = 3000;
const MAX_MUSIC_MS = 600000;

type QueryMusicRequest = {
  query_id?: string;
  duration_ms?: number;
};

const getMusicPathname = (userId: string, queryId: string) => {
  return `${userId}_audio/music_${queryId}.mp3`;
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

  const body = (await request.json()) as QueryMusicRequest;
  const queryId = body.query_id?.trim();
  const requestedMs = Math.round(body.duration_ms ?? 0);

  if (!queryId) {
    return NextResponse.json({ error: "query_id is required" }, { status: 400 });
  }

  const musicLengthMs = Math.min(
    MAX_MUSIC_MS,
    Math.max(MIN_MUSIC_MS, requestedMs || MIN_MUSIC_MS),
  );

  const musicResponse = await fetch(ELEVENLABS_MUSIC_URL, {
    method: "POST",
    headers: {
      "xi-api-key": elevenLabsApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: MUSIC_PROMPT,
      music_length_ms: musicLengthMs,
      model_id: "music_v1",
      force_instrumental: true,
    }),
  });

  if (!musicResponse.ok) {
    const detail = await musicResponse.text();
    return NextResponse.json(
      { error: detail || "Failed to generate background music" },
      { status: musicResponse.status },
    );
  }

  const music = Buffer.from(await musicResponse.arrayBuffer());
  const pathname = getMusicPathname(userId, queryId);
  const blob = await put(pathname, music, {
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
      body: JSON.stringify({ music_url: blob.url }),
    },
  );

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    return NextResponse.json(
      { error: errorText || "Failed to update query music_url" },
      { status: updateResponse.status },
    );
  }

  return NextResponse.json({
    music_url: blob.url,
    stream_url: `/api/query-audio-stream?pathname=${encodeURIComponent(pathname)}`,
  });
};
