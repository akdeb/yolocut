import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLOB_BASE_URL =
  process.env.BLOB_BASE_URL ?? "https://nl1diqavf0vxk1gf.private.blob.vercel-storage.com";
const SESSION_COOKIE = "yolocut_session";

const PASSTHROUGH_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
];

const getAuthorizationHeader = (token: string) => {
  const normalizedToken = token.trim();
  return normalizedToken.toLowerCase().startsWith("bearer ")
    ? normalizedToken
    : `Bearer ${normalizedToken}`;
};

export const GET = async (request: Request) => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get("pathname");

  if (!token) {
    return NextResponse.json(
      { error: "Missing BLOB_READ_WRITE_TOKEN" },
      { status: 500 },
    );
  }

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!pathname || pathname.includes("..") || !pathname.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: "Blob pathname is required" }, { status: 400 });
  }

  const upstreamHeaders = new Headers({
    Authorization: getAuthorizationHeader(token),
  });
  const range = request.headers.get("range");

  if (range) {
    upstreamHeaders.set("Range", range);
  }

  const upstream = await fetch(`${BLOB_BASE_URL}/${pathname}`, {
    headers: upstreamHeaders,
  });

  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304) {
    return NextResponse.json(
      { error: "Failed to load b-roll video" },
      { status: upstream.status },
    );
  }

  const responseHeaders = new Headers();

  for (const header of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(header);

    if (value) {
      responseHeaders.set(header, value);
    }
  }

  responseHeaders.set("Cache-Control", "private, max-age=300");

  return new Response(upstream.body, {
    headers: responseHeaders,
    status: upstream.status,
    statusText: upstream.statusText,
  });
};
