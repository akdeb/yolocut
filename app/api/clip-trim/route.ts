import { execFile } from "node:child_process";
import { chmodSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const execFileAsync = promisify(execFile);
const SESSION_COOKIE = "yolocut_session";

// getExecutablePath lives inside RenderInternals (not a top-level export) and is
// absent from the TS declarations, so we pull it out via require at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const { RenderInternals } = require("@remotion/renderer") as {
  RenderInternals: {
    getExecutablePath: (opts: {
      type: "ffmpeg" | "ffprobe" | "compositor";
      indent: boolean;
      logLevel: "error" | "info" | "verbose" | "warn" | "trace";
      binariesDirectory: string | null;
    }) => string;
  };
};

const getFfmpegPath = () => {
  const bin = RenderInternals.getExecutablePath({ type: "ffmpeg", indent: false, logLevel: "error", binariesDirectory: null });
  try { chmodSync(bin, 0o755); } catch { /* already executable */ }
  return bin;
};
const BLOB_BASE_URL =
  process.env.BLOB_BASE_URL ?? "https://nl1diqavf0vxk1gf.private.blob.vercel-storage.com";
const MAX_CLIP_SECONDS = 120;

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
    const sourceUrl = `${BLOB_BASE_URL}/${encodeBlobPathname(pathname)}`;

    // -ss before -i seeks via HTTP range requests, so ffmpeg reads only the
    // moov atom plus the requested segment instead of the whole source file.
    await execFileAsync(
      getFfmpegPath(),
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
