import { NextRequest, NextResponse } from "next/server";
import { enqueueActivityProcessing } from "@/lib/qstash";

/**
 * Handles Strava Webhook Verification Subscription Challenge.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.STRAVA_VERIFY_TOKEN;

  if (mode === "subscribe" && token === expectedToken && challenge) {
    return NextResponse.json({ "hub.challenge": challenge });
  }

  return NextResponse.json({ error: "Forbidden verification token" }, { status: 403 });
}

/**
 * Handles incoming Strava activity and athlete event notifications.
 * Fast-acks with 200 OK within 500ms and offloads processing to Upstash QStash.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { object_type, object_id, aspect_type, owner_id, event_time } = body;

    // Filter only activity creation and update events
    if (object_type === "activity" && (aspect_type === "create" || aspect_type === "update")) {
      await enqueueActivityProcessing({
        activityId: object_id,
        athleteId: owner_id,
        aspectType: aspect_type,
        eventTime: event_time || Math.floor(Date.now() / 1000),
      });
    }

    return NextResponse.json({ status: "acknowledged" }, { status: 200 });
  } catch (error: unknown) {
    // Always return 200 OK to Strava to prevent webhook suspension on malformed payloads
    return NextResponse.json({ status: "ignored", error: error instanceof Error ? error.message : "unknown" }, { status: 200 });
  }
}
