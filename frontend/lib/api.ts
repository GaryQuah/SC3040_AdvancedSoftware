/**
 * Client for communicating with the FastAPI Python backend service.
 */

export interface RecommendedWorkout {
  type: "Rest" | "Active Recovery" | "Zone 2 Base" | "Tempo" | "Intervals" | "Long Run/Ride";
  durationMinutes: number;
  targetHrZone: string;
  description: string;
  structuredWorkoutPlan: string;
}

export interface RecommendationResult {
  readinessScore: number;
  injuryRiskLevel: "low" | "moderate" | "high" | "critical";
  recoveryStatus: "fresh" | "optimal" | "fatigued" | "overreaching";
  recommendedWorkout: RecommendedWorkout;
  coachingRationale: string;
  keyInsights: string[];
}

export interface AcwrDataPoint {
  day: string;
  date: string;
  trimp: number;
  acute: number;
  chronic: number;
  acwr: number;
}

export interface AcwrResponse {
  history: AcwrDataPoint[];
  currentAcwr: number;
  acuteLoad7d: number;
  chronicLoad28d: number;
  status: "undertraining" | "sweet_spot" | "overreaching" | "danger";
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

/**
 * Helper to build auth headers
 */
function getAuthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Health check probe
 */
export async function checkBackendHealth(): Promise<{ status: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    return await res.json();
  } catch {
    return { status: "offline" };
  }
}

/**
 * Generates an AI daily workout and recovery recommendation from the FastAPI backend.
 */
export async function generateDailyRecommendation(
  userId: string = "00000000-0000-0000-0000-000000000001",
  token?: string
): Promise<RecommendationResult> {
  const res = await fetch(`${BACKEND_URL}/api/v1/recommendations/generate`, {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ userId }),
    cache: "no-store",
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Backend returned error ${res.status}`);
  }

  return await res.json();
}

/**
 * Fetches recent ACWR training loads and acute/chronic metrics.
 */
export async function fetchAcwrAnalytics(
  userId: string = "00000000-0000-0000-0000-000000000001",
  token?: string
): Promise<AcwrResponse> {
  const res = await fetch(`${BACKEND_URL}/api/v1/analytics/acwr?userId=${encodeURIComponent(userId)}`, {
    headers: getAuthHeaders(token),
    cache: "no-store",
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Failed to fetch ACWR data: ${res.status}`);
  }

  return await res.json();
}

/**
 * Triggers activity processing / simulation on the FastAPI backend.
 */
export async function triggerActivitySync(
  activityId: number,
  athleteId?: number,
  token?: string
): Promise<{ success: boolean; trimpScore: number; acwr: number }> {
  const res = await fetch(`${BACKEND_URL}/api/v1/activities/process`, {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ activityId, athleteId }),
    cache: "no-store",
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Failed to process activity: ${res.status}`);
  }

  return await res.json();
}
