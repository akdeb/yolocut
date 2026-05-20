import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AgentChatMessage = {
  role: "agent" | "user";
  text: string;
};

type AgentChatRequest = {
  message?: string;
  query_id?: string;
  query_text?: string;
  selected_clip_count?: number;
  messages?: AgentChatMessage[];
};

const getResponseText = (payload: unknown) => {
  if (typeof payload !== "object" || payload === null) {
    return "";
  }

  if ("output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const output = "output" in payload && Array.isArray(payload.output) ? payload.output : [];

  return output
    .flatMap((item) => {
      if (typeof item !== "object" || item === null || !("content" in item) || !Array.isArray(item.content)) {
        return [];
      }

      return item.content.flatMap((contentItem: unknown) => {
        if (
          typeof contentItem === "object" &&
          contentItem !== null &&
          "text" in contentItem &&
          typeof contentItem.text === "string"
        ) {
          return [contentItem.text];
        }

        return [];
      });
    })
    .join("\n")
    .trim();
};

export const POST = async (request: Request) => {
  const body = (await request.json()) as AgentChatRequest;
  const message = body.message?.trim();

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      message:
        "I can chat once OPENAI_API_KEY is set. For now I have the studio context and can display status locally.",
    });
  }

  const input = [
    {
      role: "system",
      content:
        "You are Yolocut's video creation agent. Be concise, practical, and focus on improving the current short-form edit.",
    },
    {
      role: "user",
      content: JSON.stringify({
        query_id: body.query_id,
        query_text: body.query_text,
        selected_clip_count: body.selected_clip_count,
        recent_messages: body.messages?.slice(-8) ?? [],
        message,
      }),
    },
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_AGENT_MODEL ?? "gpt-4.1-mini",
      input,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    return NextResponse.json(
      { error: errorText || "OpenAI agent request failed" },
      { status: response.status },
    );
  }

  const payload = (await response.json()) as unknown;
  const responseText = getResponseText(payload);

  return NextResponse.json({
    message: responseText || "I received that, but did not get a text response back.",
  });
};
