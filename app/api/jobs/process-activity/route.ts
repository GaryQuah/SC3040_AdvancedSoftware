import { NextRequest, NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/qstash";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchStravaActivity,
  fetchStravaActivityStreams,
  refreshStravaToken,
} from "@/lib/strava";
import {
  calculateBanisterTrimp,
  calculateHrZones,
  calculateAcwr,
} from "@/lib/calculations";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("upstash-signature");

  const isValid = await verifyQStashSignature(signature, rawBody);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { activityId, athleteId } = payload;
  if (!activityId) {
    return NextResponse.json({ error: "Missing activityId" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Find athlete profile
  const { data: profile, error: profileError } = await supabase
    .from("athlete_profiles")
    .select("*")
    .eq("strava_athlete_id", athleteId)
    .maybeSingle();

  const userId = profile?.user_id || "00000000-0000-0000-0000-000000000001";
  let accessToken = profile?.strava_access_token || "mock_strava_access_token";

  // Check token expiry and rotate if needed
  const nowUnix = Math.floor(Date.now() / 1000);
  if (profile?.strava_token_expires_at && profile.strava_token_expires_at <= nowUnix + 300) {
    if (profile.strava_refresh_token) {
      try {
        const refreshed = await refreshStravaToken(profile.strava_refresh_token);
        accessToken = refreshed.access_token;
        await supabase
          .from("athlete_profiles")
          .update({
            strava_access_token: refreshed.access_token,
            strava_refresh_token: refreshed.refresh_token,
            strava_token_expires_at: refreshed.expires_at,
            updated_at: new Date().toISOString(),
          })
          .eq("id", profile.id);
      } catch (tokenErr) {
        console.error("Token refresh failed:", tokenErr);
      }
    }
  }

  // Fetch activity & telemetry streams
  const activityData = await fetchStravaActivity(accessToken, activityId);
  const streams = await fetchStravaActivityStreams(accessToken, activityId, ["time", "heartrate"]);

  const athleteParams = {
    restHr: profile?.rest_hr || 60,
    maxHr: profile?.max_hr || 190,
    gender: (profile?.gender as "male" | "female") || "male",
  };

  const streamData = {
    time: streams.time?.data,
    heartrate: streams.heartrate?.data,
  };

  const trimpScore = calculateBanisterTrimp(
    activityData.moving_time,
    activityData.average_heartrate || null,
    athleteParams,
    streamData
  );

  const hrZones = calculateHrZones(athleteParams.maxHr, streamData);

  // Persist Activity
  await supabase.from("activities").upsert(
    {
      user_id: userId,
      strava_activity_id: activityData.id,
      name: activityData.name,
      type: activityData.type,
      start_date: activityData.start_date,
      elapsed_time: activityData.elapsed_time,
      moving_time: activityData.moving_time,
      distance: activityData.distance,
      total_elevation_gain: activityData.total_elevation_gain,
      average_heartrate: activityData.average_heartrate || null,
      max_heartrate: activityData.max_heartrate || null,
      trimp_score: trimpScore,
      streams_summary: hrZones,
      raw_streams: streamData,
      created_at: new Date().toISOString(),
    },
    { onConflict: "strava_activity_id" }
  );

  // Aggregate daily training load and recalculate ACWR
  const activityDate = activityData.start_date.split("T")[0];

  const { data: pastLoads } = await supabase
    .from("daily_training_loads")
    .select("date, daily_trimp")
    .eq("user_id", userId)
    .order("date", { ascending: true })
    .limit(28);

  const loadMap = new Map<string, number>();
  pastLoads?.forEach((l) => loadMap.set(l.date, Number(l.daily_trimp)));
  loadMap.set(activityDate, (loadMap.get(activityDate) || 0) + trimpScore);

  const last28DayLoads: number[] = [];
  const curr = new Date();
  for (let i = 27; i >= 0; i--) {
    const d = new Date(curr);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    last28DayLoads.push(loadMap.get(dateStr) || 0);
  }

  const { acuteLoad7d, chronicLoad28d, acwr } = calculateAcwr(last28DayLoads);

  await supabase.from("daily_training_loads").upsert(
    {
      user_id: userId,
      date: activityDate,
      daily_trimp: loadMap.get(activityDate) || trimpScore,
      acute_load_7d: acuteLoad7d,
      chronic_load_28d: chronicLoad28d,
      acwr: acwr,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,date" }
  );

  return NextResponse.json({
    success: true,
    activityId: activityData.id,
    trimpScore,
    acuteLoad7d,
    chronicLoad28d,
    acwr,
  });
}
