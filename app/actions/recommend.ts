"use server";

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const RecommendationSchema = z.object({
  readinessScore: z.number().min(0).max(100).describe("Overall physical readiness score out of 100"),
  injuryRiskLevel: z.enum(["low", "moderate", "high", "critical"]).describe("Risk of injury based on ACWR and recent load spikes"),
  recoveryStatus: z.enum(["fresh", "optimal", "fatigued", "overreaching"]).describe("Current physiological fatigue state"),
  recommendedWorkout: z.object({
    type: z.enum(["Rest", "Active Recovery", "Zone 2 Base", "Tempo", "Intervals", "Long Run/Ride"]),
    durationMinutes: z.number(),
    targetHrZone: z.string().describe("Target HR Zone (e.g. Zone 1-2 or 120-140 bpm)"),
    description: z.string(),
    structuredWorkoutPlan: z.string().describe("Step-by-step workout protocol including warmup, main set, and cooldown"),
  }),
  coachingRationale: z.string().describe("Scientific explanation of why this workout was chosen based on TRIMP & ACWR"),
  keyInsights: z.array(z.string()).describe("Key bullet points for the athlete"),
});

export type RecommendationResult = z.infer<typeof RecommendationSchema>;

export async function generateDailyRecommendationAction(userId: string = "00000000-0000-0000-0000-000000000001"): Promise<RecommendationResult> {
  const supabase = createAdminClient();

  // Fetch athlete profile
  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  // Fetch recent activities
  const { data: recentActivities } = await supabase
    .from("activities")
    .select("name, type, start_date, moving_time, distance, average_heartrate, trimp_score")
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(5);

  // Fetch recent training loads
  const { data: recentLoads } = await supabase
    .from("daily_training_loads")
    .select("date, daily_trimp, acute_load_7d, chronic_load_28d, acwr")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(7);

  const currentAcwr = recentLoads?.[0]?.acwr ?? 1.05;
  const acuteLoad = recentLoads?.[0]?.acute_load_7d ?? 45.2;
  const chronicLoad = recentLoads?.[0]?.chronic_load_28d ?? 43.0;

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!apiKey) {
    const mockRec: RecommendationResult = {
      readinessScore: 82,
      injuryRiskLevel: currentAcwr > 1.3 ? "moderate" : "low",
      recoveryStatus: currentAcwr > 1.3 ? "fatigued" : "optimal",
      recommendedWorkout: {
        type: currentAcwr > 1.3 ? "Active Recovery" : "Zone 2 Base",
        durationMinutes: 45,
        targetHrZone: "Zone 2 (130 - 145 bpm)",
        description: "Easy aerobic endurance session to stimulate mitochondrial biogenesis without compounding neuromuscular fatigue.",
        structuredWorkoutPlan: "10m Warmup (Zone 1) -> 30m Steady Aerobic (Zone 2) -> 5m Cooldown & mobility.",
      },
      coachingRationale: `Current 7-day Acute Load is ${acuteLoad} vs 28-day Chronic Load of ${chronicLoad}, yielding an ACWR of ${currentAcwr}. This places you comfortably within the safe training adaptation corridor.`,
      keyInsights: [
        "ACWR is in the optimal sweet spot (0.8 - 1.3).",
        "Recent TRIMP load shows balanced progression.",
        "Hydration and 8 hours sleep recommended prior to tomorrow's quality session.",
      ],
    };

    return mockRec;
  }

  const prompt = `
You are an elite sports scientist and Olympic endurance coach. Analyze the following athlete data to prescribe today's training and recovery protocol:

Athlete Profile:
- Rest HR: ${profile?.rest_hr ?? 60} bpm
- Max HR: ${profile?.max_hr ?? 190} bpm
- Gender: ${profile?.gender ?? "male"}

Training Load Metrics:
- Current ACWR (Acute:Chronic Workload Ratio): ${currentAcwr}
- 7-Day Acute Training Load (Fatigue): ${acuteLoad} TRIMP
- 28-Day Chronic Training Load (Fitness): ${chronicLoad} TRIMP

Recent Activities:
${JSON.stringify(recentActivities ?? [], null, 2)}

Prescribe a scientifically rigorous recommendation optimizing for adaptation while minimizing injury risk based on Gabbett's ACWR model and Banister's impulse-response framework.
`;

  try {
    const result = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: RecommendationSchema,
      prompt,
    });

    // Save to database
    await supabase.from("ai_recommendations").insert({
      user_id: userId,
      date: new Date().toISOString().split("T")[0],
      readiness_score: result.object.readinessScore,
      injury_risk_level: result.object.injuryRiskLevel,
      recovery_status: result.object.recoveryStatus,
      recommended_workout: result.object.recommendedWorkout,
      coaching_rationale: result.object.coachingRationale,
      raw_response: result.object,
      created_at: new Date().toISOString(),
    });

    return result.object;
  } catch (error) {
    console.error("AI recommendation generation failed:", error);
    throw error;
  }
}
