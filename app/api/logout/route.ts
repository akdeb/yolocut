import { NextResponse } from "next/server";

const SESSION_COOKIE = "yolocut_session";

export const POST = async () => {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);

  return response;
};
