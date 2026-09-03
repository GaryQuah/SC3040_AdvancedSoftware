import time
from typing import Any, Dict, List, Optional
import httpx
from pydantic import BaseModel
from .config import get_settings


class StravaTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_at: int
    athlete: Optional[Dict[str, Any]] = None


class StravaActivity(BaseModel):
    id: int
    name: str
    type: str
    start_date: str
    elapsed_time: int
    moving_time: int
    distance: float
    total_elevation_gain: float
    average_heartrate: Optional[float] = None
    max_heartrate: Optional[float] = None


async def exchange_strava_token(code: str) -> StravaTokenResponse:
    """Exchanges an authorization code for Strava OAuth tokens."""
    settings = get_settings()

    if not settings.STRAVA_CLIENT_ID or not settings.STRAVA_CLIENT_SECRET or code.startswith("mock_"):
        # Fallback mock for local development and demonstration
        return StravaTokenResponse(
            access_token=f"mock_strava_access_token_{int(time.time())}",
            refresh_token="mock_strava_refresh_token",
            expires_at=int(time.time()) + 21600,
            athlete={
                "id": 99999999,
                "firstname": "Alex",
                "lastname": "Endurance",
                "sex": "M",
                "weight": 70.0,
            },
        )

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id": settings.STRAVA_CLIENT_ID,
                "client_secret": settings.STRAVA_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return StravaTokenResponse(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            expires_at=data["expires_at"],
            athlete=data.get("athlete"),
        )


async def refresh_strava_token(refresh_token: str) -> StravaTokenResponse:
    """Refreshes an expired Strava access token."""
    settings = get_settings()

    if not settings.STRAVA_CLIENT_ID or not settings.STRAVA_CLIENT_SECRET or refresh_token.startswith("mock_"):
        return StravaTokenResponse(
            access_token=f"mock_strava_refreshed_token_{int(time.time())}",
            refresh_token=refresh_token,
            expires_at=int(time.time()) + 21600,
        )

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id": settings.STRAVA_CLIENT_ID,
                "client_secret": settings.STRAVA_CLIENT_SECRET,
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return StravaTokenResponse(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            expires_at=data["expires_at"],
        )


async def fetch_strava_activity(access_token: str, activity_id: int) -> StravaActivity:
    """Fetches high-level activity metadata from Strava."""
    if access_token.startswith("mock_"):
        return StravaActivity(
            id=activity_id,
            name="Morning Threshold Run",
            type="Run",
            start_date=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            elapsed_time=2700,
            moving_time=2700,
            distance=10000.0,
            total_elevation_gain=120.0,
            average_heartrate=156.0,
            max_heartrate=178.0,
        )

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"https://www.strava.com/api/v3/activities/{activity_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        return StravaActivity(
            id=data["id"],
            name=data.get("name", "Untitled Workout"),
            type=data.get("type", "Workout"),
            start_date=data["start_date"],
            elapsed_time=data["elapsed_time"],
            moving_time=data["moving_time"],
            distance=float(data.get("distance", 0.0)),
            total_elevation_gain=float(data.get("total_elevation_gain", 0.0)),
            average_heartrate=data.get("average_heartrate"),
            max_heartrate=data.get("max_heartrate"),
        )


async def fetch_strava_activity_streams(
    access_token: str, activity_id: int, stream_types: Optional[List[str]] = None
) -> Dict[str, List[int]]:
    """Fetches telemetry stream data (time, heartrate) for detailed TRIMP modeling."""
    if stream_types is None:
        stream_types = ["time", "heartrate"]

    if access_token.startswith("mock_"):
        # Synthesize realistic 45-minute telemetry curve
        duration = 2700
        step = 5
        times = list(range(0, duration, step))
        # Simulated progressive HR build from 120 bpm to 165 bpm with noise
        hrs = [
            int(min(185, max(110, 125 + (i / len(times)) * 40 + (i % 7) * 2 - 5)))
            for i in range(len(times))
        ]
        return {"time": times, "heartrate": hrs}

    keys = ",".join(stream_types)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"https://www.strava.com/api/v3/activities/{activity_id}/streams?keys={keys}&key_by_type=true",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        result: Dict[str, List[int]] = {}
        for key in stream_types:
            if key in data and "data" in data[key]:
                result[key] = data[key]["data"]
        return result
