export interface StravaTokenResponse {
  token_type: string;
  access_token: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  athlete?: {
    id: number;
    username?: string;
    firstname?: string;
    lastname?: string;
    sex?: string;
    weight?: number;
  };
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  has_heartrate: boolean;
}

export interface StravaStreamsResponse {
  time?: { data: number[] };
  heartrate?: { data: number[] };
  distance?: { data: number[] };
}

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";

export function getStravaAuthUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.STRAVA_CLIENT_ID || "mock_client_id";
  const scope = "read,activity:read_all,profile:read_all";
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    approval_prompt: "auto",
    scope,
    ...(state ? { state } : {}),
  });

  return `${STRAVA_OAUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeStravaToken(code: string): Promise<StravaTokenResponse> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      token_type: "Bearer",
      access_token: "mock_strava_access_token",
      expires_at: Math.floor(Date.now() / 1000) + 21600,
      expires_in: 21600,
      refresh_token: "mock_strava_refresh_token",
      athlete: {
        id: 99999999,
        firstname: "Demo",
        lastname: "Athlete",
        sex: "M",
        weight: 72,
      },
    };
  }

  const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to exchange Strava token: ${response.status} ${errText}`);
  }

  return response.json();
}

export async function refreshStravaToken(refreshToken: string): Promise<StravaTokenResponse> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret || refreshToken.startsWith("mock_")) {
    return {
      token_type: "Bearer",
      access_token: "mock_strava_access_token_refreshed",
      expires_at: Math.floor(Date.now() / 1000) + 21600,
      expires_in: 21600,
      refresh_token: refreshToken,
    };
  }

  const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to refresh Strava token: ${response.status} ${errText}`);
  }

  return response.json();
}

export async function fetchStravaActivity(
  accessToken: string,
  activityId: number
): Promise<StravaActivity> {
  if (accessToken.startsWith("mock_")) {
    return {
      id: activityId,
      name: "Morning Threshold Run (Mock)",
      type: "Run",
      start_date: new Date().toISOString(),
      elapsed_time: 3600,
      moving_time: 3450,
      distance: 10500,
      total_elevation_gain: 85,
      average_heartrate: 156,
      max_heartrate: 178,
      has_heartrate: true,
    };
  }

  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to fetch Strava activity ${activityId}: ${err}`);
  }

  return response.json();
}

export async function fetchStravaActivityStreams(
  accessToken: string,
  activityId: number,
  keys: string[] = ["time", "heartrate"]
): Promise<StravaStreamsResponse> {
  if (accessToken.startsWith("mock_")) {
    const mockLength = 120;
    const time = Array.from({ length: mockLength }, (_, i) => i * 30);
    const heartrate = Array.from({ length: mockLength }, (_, i) => {
      const progress = i / mockLength;
      return Math.round(130 + Math.sin(progress * Math.PI) * 45 + (Math.random() * 6 - 3));
    });
    return {
      time: { data: time },
      heartrate: { data: heartrate },
    };
  }

  const keysParam = keys.join(",");
  const response = await fetch(
    `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=${keysParam}&key_by_type=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to fetch Strava streams for activity ${activityId}: ${err}`);
  }

  return response.json();
}
