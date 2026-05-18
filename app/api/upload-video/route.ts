import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_VIDEO_BYTES = 1024 * 1024 * 1024 * 4;

const sanitizeFilename = (filename: string) => {
  return filename
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
};

export const POST = async (request: Request) => {
  const token = process.env.VIDEO_STUDIO_READ_WRITE_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: "Missing VIDEO_STUDIO_READ_WRITE_TOKEN" },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Video file is required" }, { status: 400 });
  }

  if (!file.type.startsWith("video/")) {
    return NextResponse.json({ error: "Only video files are supported" }, { status: 400 });
  }

  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "Video file is too large" }, { status: 413 });
  }

  const filename = sanitizeFilename(file.name) || "video";
  const pathname = `videos/${Date.now()}-${filename}`;
  const blob = await put(pathname, file, {
    access: "public",
    addRandomSuffix: true,
    token,
  });

  return NextResponse.json({
    url: blob.url,
    pathname: blob.pathname,
    size: file.size,
    contentType: file.type,
  });
};
