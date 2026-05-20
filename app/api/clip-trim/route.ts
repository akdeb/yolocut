import { execFile } from "node:child_process";
import { accessSync, chmodSync, constants, statSync } from "node:fs";
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
const BLOB_BASE_URL =
  process.env.BLOB_BASE_URL ?? "https://nl1diqavf0vxk1gf.private.blob.vercel-storage.com";
const MAX_CLIP_SECONDS = 120;

// Mirrors Remotion's own get-executable-path + make-file-executable logic.
// We resolve the path ourselves so we never go through npx/npm at runtime.
const getFfmpegBin = (): { bin: string; cwd: string; env: NodeJS.ProcessEnv | undefined } => {
  const p = process.platform;
  const a = process.arch;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const getDir = (): string => {
    if (p === "darwin" && a === "arm64") return (require("@remotion/compositor-darwin-arm64") as { dir: string }).dir;
    if (p === "darwin" && a === "x64") return (require("@remotion/compositor-darwin-x64") as { dir: string }).dir;
    if (p === "linux" && a === "x64") {
      try { return (require("@remotion/compositor-linux-x64-gnu") as { dir: string }).dir; } catch { /* musl fallback */ }
      return (require("@remotion/compositor-linux-x64-musl") as { dir: string }).dir;
    }
    if (p === "linux" && a === "arm64") {
      try { return (require("@remotion/compositor-linux-arm64-gnu") as { dir: string }).dir; } catch { /* musl fallback */ }
      return (require("@remotion/compositor-linux-arm64-musl") as { dir: string }).dir;
    }
    if (p === "win32") return (require("@remotion/compositor-win32-x64-msvc") as { dir: string }).dir;
    throw new Error(`Unsupported platform: ${p}/${a}`);
  };

  const dir = getDir();
  const bin = path.join(dir, p === "win32" ? "ffmpeg.exe" : "ffmpeg");

  // Ensure executable — may fail on read-only Lambda fs, but npm preserves the bit anyway.
  try {
    let ok = false;
    if (p === "linux" || p === "darwin") {
      const s = statSync(bin);
      const uid = process.getuid?.() ?? -1;
      const gid = process.getgid?.() ?? -1;
      ok = Boolean(s.mode & 0o001) ||
        (uid === s.uid && Boolean(s.mode & 0o100)) ||
        (gid === s.gid && Boolean(s.mode & 0o010));
    } else {
      try { accessSync(bin, constants.X_OK); ok = true; } catch { ok = false; }
    }
    if (!ok) chmodSync(bin, 0o755);
  } catch { /* best-effort */ }

  // macOS needs DYLD_LIBRARY_PATH so the binary can find the bundled .dylib files.
  const env = p === "darwin" ? { ...process.env, DYLD_LIBRARY_PATH: dir } : undefined;

  return { bin, cwd: dir, env };
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
    const sourceUrl = `${BLOB_BASE_URL}/${encodeBlobPathname(pathname)}`;
    const { bin, cwd, env } = getFfmpegBin();

    // -ss before -i seeks via HTTP range requests, so ffmpeg reads only the
    // moov atom plus the requested segment instead of the whole source file.
    await execFileAsync(
      bin,
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
      { maxBuffer: 1024 * 1024 * 64, cwd, env },
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
