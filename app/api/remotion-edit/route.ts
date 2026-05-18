import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const REMOTION_EDIT_PATH = path.join(process.cwd(), ".yolocut", "remotion-edit.json");
const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

export const runtime = "nodejs";

type RemotionEditClip = {
  src: string;
  name: string;
  startInSeconds: number;
  endInSeconds: number;
};

type RemotionEditRequest = {
  clips?: RemotionEditClip[];
  audioSrc?: string;
  audioDurationInSeconds?: number;
};

export const POST = async (request: Request) => {
  const body = (await request.json()) as RemotionEditRequest;
  const clips = body.clips ?? [];

  if (clips.length === 0) {
    return NextResponse.json(
      { error: "At least one clip is required" },
      { headers: CORS_HEADERS, status: 400 },
    );
  }

  if (!body.audioSrc) {
    return NextResponse.json(
      { error: "audioSrc is required" },
      { headers: CORS_HEADERS, status: 400 },
    );
  }

  const payload = {
    clips,
    audioSrc: body.audioSrc,
    audioDurationInSeconds: body.audioDurationInSeconds ?? 0,
    updatedAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(REMOTION_EDIT_PATH), { recursive: true });
  await writeFile(REMOTION_EDIT_PATH, JSON.stringify(payload, null, 2));

  return NextResponse.json(
    {
      ok: true,
      clipCount: clips.length,
      studioUrl: `http://127.0.0.1:3002/CaptionedVideo?edit=${Date.now()}`,
    },
    { headers: CORS_HEADERS },
  );
};

export const GET = async () => {
  try {
    const payload = await readFile(REMOTION_EDIT_PATH, "utf8");

    return new Response(payload, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { clips: [], audioSrc: null, audioDurationInSeconds: 0 },
      { headers: CORS_HEADERS },
    );
  }
};

export const OPTIONS = () => {
  return new Response(null, { headers: CORS_HEADERS });
};
