import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://orjrkzierhpmkamhwejb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_RZ3yKF9mu4azumK5FkbDZg_ogc7SaRO";

type CreateQueryRequest = {
  query_text?: string;
};

const supabaseHeaders = {
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
  "Content-Type": "application/json",
};

export const POST = async (request: Request) => {
  const body = (await request.json()) as CreateQueryRequest;
  const queryText = body.query_text?.trim();

  if (!queryText) {
    return NextResponse.json({ error: "query_text is required" }, { status: 400 });
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/queries`, {
    method: "POST",
    headers: {
      ...supabaseHeaders,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      query_text: queryText,
      broll_jsonb: null,
      audio_url: null,
      music_url: null,
      captions_url: null,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    return NextResponse.json(
      { error: errorText || "Failed to create query" },
      { status: response.status },
    );
  }

  const rows = (await response.json()) as unknown[];
  return NextResponse.json({ query: rows[0] ?? null });
};
