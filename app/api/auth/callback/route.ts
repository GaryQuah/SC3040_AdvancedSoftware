import { NextRequest, NextResponse } from "next/server";
import { exchangeStravaToken } from "@/lib/strava";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent(error || "missing_code")}`);
  }

  try {
    const tokenData = await exchangeStravaToken(code);
    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    // Check existing auth session or user
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || "00000000-0000-0000-0000-000000000001"; // Fallback demo user ID if running without full auth

    if (tokenData.athlete?.id) {
      await adminSupabase.from("athlete_profiles").upsert(
        {
          user_id: userId,
          strava_athlete_id: tokenData.athlete.id,
          strava_access_token: tokenData.access_token,
          strava_refresh_token: tokenData.refresh_token,
          strava_token_expires_at: tokenData.expires_at,
          gender: tokenData.athlete.sex === "F" ? "female" : "male",
          weight_kg: tokenData.athlete.weight || 70.0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }

    return NextResponse.redirect(`${appUrl}/`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "auth_failed";
    return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent(message)}`);
  }
}
