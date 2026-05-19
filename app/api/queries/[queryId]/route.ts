import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://orjrkzierhpmkamhwejb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_RZ3yKF9mu4azumK5FkbDZg_ogc7SaRO";

type UpdateQueryRequest = {
  broll_jsonb?: unknown;
  audio_url?: string | null;
  music_url?: string | null;
  captions_url?: string | null;
};

const supabaseHeaders = {
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
  "Content-Type": "application/json",
};

type RouteContext = {
  params: Promise<{ queryId: string }>;
};

export const GET = async (_request: Request, context: RouteContext) => {
  const { queryId } = await context.params;
  const query = new URLSearchParams({
    query_id: `eq.${queryId}`,
    select: "*",
    limit: "1",
  });

  const response = await fetch(`${SUPABASE_URL}/rest/v1/queries?${query.toString()}`, {
    headers: supabaseHeaders,
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: errorText || "Failed to load query" },
      { status: response.status },
    );
  }

  const rows = (await response.json()) as unknown[];
  const row = rows[0] ?? null;

  if (!row) {
    return NextResponse.json({ error: "Query not found" }, { status: 404 });
  }

  return NextResponse.json({ query: row });
};

export const PATCH = async (request: Request, context: RouteContext) => {
  const { queryId } = await context.params;
  const body = (await request.json()) as UpdateQueryRequest;
  const update: UpdateQueryRequest = {};

  if ("broll_jsonb" in body) {
    update.broll_jsonb = body.broll_jsonb;
  }

  if ("audio_url" in body) {
    update.audio_url = body.audio_url;
  }

  if ("music_url" in body) {
    update.music_url = body.music_url;
  }

  if ("captions_url" in body) {
    update.captions_url = body.captions_url;
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/queries?query_id=eq.${encodeURIComponent(queryId)}`,
    {
      method: "PATCH",
      headers: {
        ...supabaseHeaders,
        Prefer: "return=representation",
      },
      body: JSON.stringify(update),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: errorText || "Failed to update query" },
      { status: response.status },
    );
  }

  const rows = (await response.json()) as unknown[];
  return NextResponse.json({ query: rows[0] ?? null });
};
