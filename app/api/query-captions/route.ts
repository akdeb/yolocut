import { put } from "@vercel/blob";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "yolocut_session";
const BLOB_BASE_URL =
  process.env.BLOB_BASE_URL ?? "https://nl1diqavf0vxk1gf.private.blob.vercel-storage.com";
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://orjrkzierhpmkamhwejb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_RZ3yKF9mu4azumK5FkbDZg_ogc7SaRO";
const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
// whisper-1 is the only OpenAI model that returns word-level timestamps; the
// newer gpt-4o-transcribe models only support json/plain text output.
const OPENAI_TRANSCRIPTION_MODEL = "whisper-1";

type QueryCaptionsRequest = {
  query_id?: string;
  audio_url?: string;
};

type WhisperWord = {
  word: string;
  start: number;
  end: number;
};

type WhisperVerboseResponse = {
  words?: WhisperWord[];
  duration?: number;
};

type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number;
  confidence: number | null;
};

const getBlobPathname = (blobUrl: string) => {
  try {
    return new URL(blobUrl).pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
};

const getCaptionsPathname = (userId: string, queryId: string) => {
  return `${userId}_audio/${queryId}.captions.json`;
};

const getAuthorizationHeader = (token: string) => {
  const normalizedToken = token.trim();
  return normalizedToken.toLowerCase().startsWith("bearer ")
    ? normalizedToken
    : `Bearer ${normalizedToken}`;
};

const transcribeWithOpenAI = async (
  audio: ArrayBuffer,
  apiKey: string,
): Promise<WhisperVerboseResponse> => {
  const formData = new FormData();
  formData.append("file", new Blob([audio], { type: "audio/mpeg" }), "voiceover.mp3");
  formData.append("model", OPENAI_TRANSCRIPTION_MODEL);
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");

  const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      (await response.text()) || `OpenAI transcription failed: ${response.status}`,
    );
  }

  return (await response.json()) as WhisperVerboseResponse;
};

const wordsToCaptions = (words: WhisperWord[]): Caption[] => {
  return words.map((word) => {
    const startMs = Math.round(word.start * 1000);

    return {
      // Leading space so adjacent caption tokens render with word spacing.
      text: ` ${word.word}`,
      startMs,
      endMs: Math.round(word.end * 1000),
      timestampMs: startMs,
      confidence: null,
    };
  });
};

const updateQueryCaptionsUrl = async (queryId: string, captionsUrl: string) => {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/queries?query_id=eq.${encodeURIComponent(queryId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ captions_url: captionsUrl }),
    },
  );

  if (!response.ok) {
    throw new Error((await response.text()) || "Failed to update query captions_url");
  }
};

export const POST = async (request: Request) => {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!blobToken) {
    return NextResponse.json({ error: "Missing BLOB_READ_WRITE_TOKEN" }, { status: 500 });
  }

  if (!openaiApiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const body = (await request.json()) as QueryCaptionsRequest;
  const queryId = body.query_id?.trim();
  const audioUrl = body.audio_url?.trim();
  const audioPathname = audioUrl ? getBlobPathname(audioUrl) : "";

  if (!queryId || !audioPathname || !audioPathname.startsWith(`${userId}_audio/`)) {
    return NextResponse.json(
      { error: "query_id and a matching query audio_url are required" },
      { status: 400 },
    );
  }

  try {
    const audioResponse = await fetch(`${BLOB_BASE_URL}/${audioPathname}`, {
      headers: { Authorization: getAuthorizationHeader(blobToken) },
    });

    if (!audioResponse.ok) {
      throw new Error(`Failed to download generated audio: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const transcription = await transcribeWithOpenAI(audioBuffer, openaiApiKey);
    const captions = wordsToCaptions(transcription.words ?? []);
    const durationMs =
      typeof transcription.duration === "number"
        ? Math.round(transcription.duration * 1000)
        : (captions[captions.length - 1]?.endMs ?? 0);

    const captionsJson = JSON.stringify(captions, null, 2);
    const captionsPathname = getCaptionsPathname(userId, queryId);
    const blob = await put(captionsPathname, captionsJson, {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
      token: blobToken,
    });

    await updateQueryCaptionsUrl(queryId, blob.url);

    return NextResponse.json({
      captions,
      captions_url: blob.url,
      duration_ms: durationMs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Caption generation failed",
      },
      { status: 500 },
    );
  }
};
