import { NextResponse } from "next/server";

type CreateVariantsRequest = {
  brief?: string;
  clips?: string[];
};

export const POST = async (request: Request) => {
  const body = (await request.json()) as CreateVariantsRequest;
  const brief = body.brief?.trim() || "Untitled brief";

  return NextResponse.json({
    variants: [
      {
        id: "A1",
        title: "Problem Hook",
        hook: `Lead with the audience pain point from: ${brief}`,
        duration: "0:18",
        status: "ready",
      },
      {
        id: "A2",
        title: "Proof First",
        hook: "Open on the strongest testimonial beat, then cut to product context.",
        duration: "0:21",
        status: "ready",
      },
      {
        id: "A3",
        title: "Fast Demo",
        hook: "Start with the clearest visual result, then add B-roll rhythm.",
        duration: "0:15",
        status: "ready",
      },
      {
        id: "A4",
        title: "Founder Style",
        hook: "Use direct-to-camera pacing with quick B-roll interrupts.",
        duration: "0:24",
        status: "ready",
      },
    ],
  });
};
