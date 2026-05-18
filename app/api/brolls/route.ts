import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SESSION_COOKIE = "yolocut_session";
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://orjrkzierhpmkamhwejb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_RZ3yKF9mu4azumK5FkbDZg_ogc7SaRO";

type CreateBrollRequest = {
  title?: string;
  size?: number;
  blob_url?: string;
  creator?: string;
};

export const POST = async (request: Request) => {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await request.json()) as CreateBrollRequest;
  const title = body.title?.trim();
  const creator = body.creator?.trim().toLowerCase();
  const blobUrl = body.blob_url?.trim();

  if (!title || !creator || !blobUrl || typeof body.size !== "number") {
    return NextResponse.json(
      { error: "title, creator, size, and blob_url are required" },
      { status: 400 },
    );
  }

  const row = {
    customer_id: userId,
    title,
    creator,
    size: body.size,
    blob_url: blobUrl,
    indexed: false,
  };

  const response = await fetch(`${SUPABASE_URL}/rest/v1/brolls`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    const errorText = await response.text();

    return NextResponse.json(
      { error: errorText || "Failed to create b-roll row" },
      { status: response.status },
    );
  }

  const data = (await response.json()) as unknown;

  return NextResponse.json({ broll: data });
};
