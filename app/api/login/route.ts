import { NextResponse } from "next/server";

const AUTH_USER_ID = "gruns";
const AUTH_PASSWORD = "grunsadmin";
const SESSION_COOKIE = "yolocut_session";

type LoginRequest = {
  username?: string;
  password?: string;
};

export const POST = async (request: Request) => {
  const body = (await request.json()) as LoginRequest;
  const username = body.username?.trim();
  const password = body.password ?? "";

  if (username !== AUTH_USER_ID || password !== AUTH_PASSWORD) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const response = NextResponse.json({ user_id: AUTH_USER_ID });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: AUTH_USER_ID,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return response;
};
