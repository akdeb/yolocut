import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_VIDEO_BYTES = 1024 * 1024 * 1024 * 4;
const SESSION_COOKIE = "yolocut_session";

const sanitizeFilename = (filename: string) => {
  return filename
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
};

export const POST = async (request: Request) => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const cookieStore = await cookies();
  const userId = sanitizeFilename(cookieStore.get(SESSION_COOKIE)?.value ?? "");

  if (!token) {
    return NextResponse.json(
      { error: "Missing BLOB_READ_WRITE_TOKEN" },
      { status: 500 },
    );
  }

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;
  const userPrefix = `${userId}/`;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async (pathname) => {
        const filename = sanitizeFilename(pathname.split("/").pop() ?? "video") || "video";

        if (!pathname.startsWith(userPrefix)) {
          throw new Error(`Upload pathname must start with ${userPrefix}`);
        }

        if (pathname !== `${userPrefix}${filename}`) {
          throw new Error("Upload pathname contains unsupported characters");
        }

        return {
          allowedContentTypes: ["video/*"],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: false,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate upload token";

    return NextResponse.json({ error: message }, { status: 400 });
  }
};
