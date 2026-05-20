import { execFile } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import ffmpegStaticPath from "ffmpeg-static";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const execFileAsync = promisify(execFile);
const SESSION_COOKIE = "yolocut_session";
const BLOB_BASE_URL =
  process.env.BLOB_BASE_URL ?? "https://nl1diqavf0vxk1gf.private.blob.vercel-storage.com";
const MAX_CLIP_SECONDS = 120;

// ffmpeg-static b6.1.1 — matches the installed package version.
// Used as a fallback when the postinstall download script fails on the build server
// (Vercel sometimes blocks outbound connections during npm install).
const FFMPEG_RELEASE = "b6.1.1";
const FFMPEG_TMP_PATH = `/tmp/ffmpeg-static-${FFMPEG_RELEASE}`;

let ffmpegPathPromise: Promise<string> | null = null;

const getFfmpegPath = (): Promise<string> => {
  if (ffmpegPathPromise) return ffmpegPathPromise;

  ffmpegPathPromise = (async () => {
    // Best case: binary was deployed alongside the function (outputFileTracingIncludes).
    if (ffmpegStaticPath && existsSync(ffmpegStaticPath)) {
      return ffmpegStaticPath;
    }

    // Fallback: binary not deployed — download it once to /tmp per Lambda instance.
    if (!existsSync(FFMPEG_TMP_PATH)) {
      const platform = process.platform; // "linux" on Lambda
      const arch = process.arch;        // "x64" on Lambda
      const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE}/ffmpeg-${platform}-${arch}.gz`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to download ffmpeg binary (${res.status}): ${url}`);
      }
      await pipeline(
        Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
        createGunzip(),
        createWriteStream(FFMPEG_TMP_PATH),
      );
      await chmod(FFMPEG_TMP_PATH, 0o755);
    }

    return FFMPEG_TMP_PATH;
  })();

  return ffmpegPathPromise;
};

type ClipTrimRequest = {
  pathname?: string;
  start?: number;
  end?: number;
};

const getAuthorizationHeader = (token: string) => {
  const normalizedToken = token.trim();
  return normalizedToken.toLowerCase().startsWith("bearer ")
    ? normalizedToken
    : `Bearer ${normalizedToken}`;
};

const encodeBlobPathname = (pathname: string) => {
  return pathname
    .split("/")
    .map((part) => encodeURIComponent(decodeURIComponent(part)))
    .join("/");
};

export const POST = async (request: Request) => {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!blobToken) {
    return NextResponse.json({ error: "Missing BLOB_READ_WRITE_TOKEN" }, { status: 500 });
  }

  const body = (await request.json()) as ClipTrimRequest;
  const pathname = body.pathname?.trim();
  const start = Math.max(0, Number(body.start) || 0);
  const end = Number(body.end) || 0;
  const duration = end - start;

  if (!pathname || pathname.includes("..") || !pathname.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: "A valid clip pathname is required" }, { status: 400 });
  }

  if (duration <= 0 || duration > MAX_CLIP_SECONDS) {
    return NextResponse.json(
      { error: "Clip must have a positive duration under two minutes" },
      { status: 400 },
    );
  }

  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "yolocut-trim-"));
  const outputPath = path.join(tempDirectory, "clip.mp4");

  try {
    const [ffmpegBin, sourceUrl] = await Promise.all([
      getFfmpegPath(),
      Promise.resolve(`${BLOB_BASE_URL}/${encodeBlobPathname(pathname)}`),
    ]);

    // -ss before -i seeks via HTTP range requests, so ffmpeg reads only the
    // moov atom plus the requested segment instead of the whole source file.
    await execFileAsync(
      ffmpegBin,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "5",
        "-headers",
        `Authorization: ${getAuthorizationHeader(blobToken)}\r\n`,
        "-ss",
        String(start),
        "-i",
        sourceUrl,
        "-t",
        String(duration),
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "26",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-y",
        outputPath,
      ],
      { maxBuffer: 1024 * 1024 * 64 },
    );

    const trimmed = await readFile(outputPath);

    return new Response(new Uint8Array(trimmed), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(trimmed.byteLength),
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to trim clip" },
      { status: 500 },
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
};
