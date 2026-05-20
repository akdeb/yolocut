import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "yolocut_session";
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://orjrkzierhpmkamhwejb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_RZ3yKF9mu4azumK5FkbDZg_ogc7SaRO";

type BrollRow = {
  broll_id: string;
  created_at: string;
  title: string | null;
  creator: string | null;
  size: number | null;
  blob_url: string | null;
  customer_id: string;
  indexed: boolean | null;
  featured: boolean | null;
};

const getBlobPathname = (blobUrl: string) => {
  try {
    return new URL(blobUrl).pathname.replace(/^\/+/, "");
  } catch {
    return blobUrl.replace(/^\/+/, "");
  }
};

const supabaseHeaders = {
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
};

const parseContentRangeCount = (contentRange: string | null) => {
  if (!contentRange) {
    return 0;
  }

  const total = contentRange.split("/")[1];

  if (!total || total === "*") {
    return 0;
  }

  return Number.parseInt(total, 10) || 0;
};

const fetchBrollCount = async (userId: string, filters: Record<string, string> = {}) => {
  const query = new URLSearchParams({
    customer_id: `eq.${userId}`,
    select: "broll_id",
    ...filters,
  });

  const response = await fetch(`${SUPABASE_URL}/rest/v1/brolls?${query.toString()}`, {
    headers: {
      ...supabaseHeaders,
      Prefer: "count=exact",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to count b-roll rows");
  }

  return parseContentRangeCount(response.headers.get("content-range"));
};

export const GET = async () => {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const query = new URLSearchParams({
    customer_id: `eq.${userId}`,
    featured: "eq.true",
    order: "created_at.desc",
    select: "broll_id,created_at,title,creator,size,blob_url,customer_id,indexed,featured",
  });

  const [totalCount, indexedCount, response] = await Promise.all([
    fetchBrollCount(userId),
    fetchBrollCount(userId, { indexed: "eq.true" }),
    fetch(`${SUPABASE_URL}/rest/v1/brolls?${query.toString()}`, {
      headers: supabaseHeaders,
    }),
  ]);

  if (!response.ok) {
    const errorText = await response.text();

    return NextResponse.json(
      { error: errorText || "Failed to load b-roll rows" },
      { status: response.status },
    );
  }

  const rows = (await response.json()) as BrollRow[];
  const videos = rows
    .filter((row) => row.blob_url)
    .map((row) => {
      const pathname = getBlobPathname(row.blob_url ?? "");
      const sizeInMegabytes = row.size ?? 0;
      const indexed = row.indexed === true;

      return {
        id: row.broll_id,
        name: row.title ?? pathname.split("/").pop() ?? "Untitled video",
        filename: row.title ?? pathname.split("/").pop() ?? "video",
        creator: row.creator ?? "",
        relative_path: pathname,
        path: pathname,
        url: row.blob_url,
        stream_url: `/api/broll-video?pathname=${encodeURIComponent(pathname)}`,
        indexed,
        size_bytes: sizeInMegabytes * 1024 * 1024,
        modified_at: row.created_at,
      };
    });

  const featuredIndexedCount = videos.filter((video) => video.indexed).length;

  return NextResponse.json({
    bucket: "yolocut-broll",
    user_id: userId,
    upload_prefix: `${userId}/`,
    count: totalCount,
    total_count: totalCount,
    indexed_count: indexedCount,
    featured_count: videos.length,
    unindexed_count: Math.max(totalCount - indexedCount, 0),
    fully_indexed: totalCount > 0 && indexedCount === totalCount,
    videos,
    featured_indexed_count: featuredIndexedCount,
  });
};
