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
};

const getBlobPathname = (blobUrl: string) => {
  try {
    return new URL(blobUrl).pathname.replace(/^\/+/, "");
  } catch {
    return blobUrl.replace(/^\/+/, "");
  }
};

export const GET = async () => {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const query = new URLSearchParams({
    customer_id: `eq.${userId}`,
    order: "created_at.desc",
    select: "broll_id,created_at,title,creator,size,blob_url,customer_id,indexed",
  });

  const response = await fetch(`${SUPABASE_URL}/rest/v1/brolls?${query.toString()}`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
  });

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

  const indexedCount = videos.filter((video) => video.indexed).length;

  return NextResponse.json({
    bucket: "yolocut-broll",
    user_id: userId,
    upload_prefix: `${userId}/`,
    count: videos.length,
    indexed_count: indexedCount,
    unindexed_count: videos.length - indexedCount,
    fully_indexed: videos.length > 0 && indexedCount === videos.length,
    videos,
  });
};
