import asyncio
from contextlib import asynccontextmanager
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- New Architecture Imports ---
from .core.config import get_settings
from .api.deps import get_current_user_id, get_supabase_admin
from .api.v1.endpoints import users

# --- Domain Logic Imports ---
from .coach import RecommendationSchema, synthesize_recommendation
from .worker import enqueue_activity_job, process_activity_pipeline, run_worker_loop
from .strava import (
    exchange_strava_token,
    refresh_strava_token,
    fetch_strava_athlete,
    fetch_strava_athlete_stats,
    fetch_strava_activities,
    fetch_strava_activity,
    fetch_strava_activity_streams,
    fetch_strava_gear
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("endurance.backend")

worker_stop_event = asyncio.Event()
worker_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: launch integrated Redis queue worker in background
    logger.info("Initializing Endurance AI Backend...")
    global worker_task, worker_stop_event
    worker_stop_event.clear()
    worker_task = asyncio.create_task(run_worker_loop(worker_stop_event))
    yield
    # Shutdown: gracefully stop the background worker
    logger.info("Shutting down background workers...")
    worker_stop_event.set()
    if worker_task:
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass


settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="Scientific Endurance Training Load & AI Recovery Backend",
    lifespan=lifespan,
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================
# API Routers 
# ================
app.include_router(users.router, prefix="/api/v1")


def get_strava_token(authorization: Optional[str] = Header(None)) -> str:
    """Extracts the forwarded Strava Access Token provided by the Next.js frontend."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Bearer token")
    return authorization.split(" ")[1]


class RecommendationRequest(BaseModel):
    userId: Optional[str] = None


class ActivityProcessRequest(BaseModel):
    activityId: int
    athleteId: Optional[int] = None


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "endurance-ai-backend",
        "environment": settings.ENVIRONMENT,
    }
    
# ============================================================================
# Strava REST Ingestion & Webhooks
# ============================================================================

strava_router = APIRouter(prefix="/api/v1/strava", tags=["Strava Direct API"])

@strava_router.post("/exchange")
async def exchange_token(code: str):
    return await exchange_strava_token(code)

@strava_router.post("/refresh")
async def refresh_token(refresh_token: str):
    return await refresh_strava_token(refresh_token)

@strava_router.get("/athlete")
async def get_athlete(authorization: Optional[str] = Header(None)):
    return await fetch_strava_athlete(get_strava_token(authorization))

@strava_router.get("/athletes/{athlete_id}/stats")
async def get_stats(athlete_id: int, authorization: Optional[str] = Header(None)):
    return await fetch_strava_athlete_stats(get_strava_token(authorization), athlete_id)

@strava_router.get("/activities")
async def get_activities(
    page: int = Query(1, ge=1), 
    per_page: int = Query(10, ge=1, le=50), 
    authorization: Optional[str] = Header(None)
):
    return await fetch_strava_activities(get_strava_token(authorization), page, per_page)

@strava_router.get("/activities/{activity_id}")
async def get_activity(activity_id: int, authorization: Optional[str] = Header(None)):
    return await fetch_strava_activity(get_strava_token(authorization), activity_id)

@strava_router.get("/activities/{activity_id}/streams")
async def get_streams(activity_id: int, authorization: Optional[str] = Header(None)):
    return await fetch_strava_activity_streams(get_strava_token(authorization), activity_id)

@strava_router.get("/gear/{gear_id}")
async def get_gear(gear_id: str, authorization: Optional[str] = Header(None)):
    return await fetch_strava_gear(get_strava_token(authorization), gear_id)

app.include_router(strava_router)


@app.get("/api/v1/webhooks/strava", tags=["Strava Webhooks"])
async def strava_webhook_challenge(
    hub_mode: str = Query(..., alias="hub.mode"),
    hub_challenge: str = Query(..., alias="hub.challenge"),
    hub_verify_token: str = Query(..., alias="hub.verify_token"),
):
    if hub_mode == "subscribe" and hub_verify_token == settings.STRAVA_VERIFY_TOKEN:
        logger.info("Strava subscription challenge verified.")
        return {"hub.challenge": hub_challenge}

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid verification token or mode")

@app.post("/api/v1/webhooks/strava", tags=["Strava Webhooks"])
async def strava_webhook_event(request: Request):
    payload = await request.json()
    logger.info(f"Received Strava event: {payload}")

    object_type = payload.get("object_type")
    aspect_type = payload.get("aspect_type")
    activity_id = payload.get("object_id")
    athlete_id = payload.get("owner_id")

    if object_type == "activity" and aspect_type in ("create", "update") and activity_id:
        await enqueue_activity_job(activity_id=activity_id, athlete_id=athlete_id)

    return {"status": "event_received"}


# ============================================================================
# Recovery & Coaching
# ============================================================================

@app.post("/api/v1/recommendations/generate", response_model=RecommendationSchema, tags=["Recovery"])
async def generate_recommendation_endpoint(
    body: RecommendationRequest,
    user_id: str = Depends(get_current_user_id), # Now uses secure Supabase JWT validation
):
    """Generates a daily AI recovery and workout protocol using Google Gemini."""
    supabase = get_supabase_admin()
    athlete_profile = None
    recent_loads = []
    recent_activities = []

    if supabase:
        try:
            p_res = supabase.table("users").select("*").eq("user_id", user_id).maybe_single().execute()
            athlete_profile = p_res.data if p_res else None

            l_res = (
                supabase.table("daily_training_loads")
                .select("date, daily_trimp, acute_load_7d, chronic_load_28d, acwr")
                .eq("user_id", user_id)
                .order("date", desc=True)
                .limit(7)
                .execute()
            )
            recent_loads = l_res.data or []

            a_res = (
                supabase.table("activities")
                .select("name, type, start_date, moving_time, distance, average_heartrate, trimp_score")
                .eq("user_id", user_id)
                .order("start_date", desc=True)
                .limit(5)
                .execute()
            )
            recent_activities = a_res.data or []
        except Exception as e:
            logger.warning(f"Error fetching data from Supabase for AI recommendation: {e}")

    recommendation = await synthesize_recommendation(
        user_id=user_id,
        athlete_profile=athlete_profile,
        recent_loads=recent_loads,
        recent_activities=recent_activities,
    )

    if supabase:
        try:
            supabase.table("ai_recommendations").insert(
                {
                    "user_id": user_id,
                    "date": logging.Formatter().converter(None)[:10] if hasattr(logging, "Formatter") else "2026-10-01", 
                    "readiness_score": recommendation.readinessScore,
                    "injury_risk_level": recommendation.injuryRiskLevel,
                    "recovery_status": recommendation.recoveryStatus,
                    "recommended_workout": recommendation.recommendedWorkout.model_dump(),
                    "coaching_rationale": recommendation.coachingRationale,
                    "raw_response": recommendation.model_dump(),
                }
            ).execute()
        except Exception as e:
            logger.warning(f"Could not persist recommendation to Supabase: {e}")

    return recommendation


# ============================================================================
# Analytics & Workload
# ============================================================================

@app.get("/api/v1/analytics/acwr", tags=["Analytics"])
async def get_acwr_analytics(
    user_id: str = Depends(get_current_user_id), # Secured the analytics endpoint
):
    supabase = get_supabase_admin()
    history = []

    if supabase:
        try:
            resp = (
                supabase.table("daily_training_loads")
                .select("date, daily_trimp, acute_load_7d, chronic_load_28d, acwr")
                .eq("user_id", user_id)
                .order("date", desc=False)
                .limit(28)
                .execute()
            )
            if resp and resp.data:
                for idx, row in enumerate(resp.data):
                    history.append(
                        {
                            "day": f"Day {idx + 1}",
                            "date": row["date"],
                            "trimp": float(row["daily_trimp"]),
                            "acute": float(row["acute_load_7d"]),
                            "chronic": float(row["chronic_load_28d"]),
                            "acwr": float(row["acwr"]),
                        }
                    )
        except Exception as e:
            logger.warning(f"Error fetching ACWR analytics: {e}")

    if not history:
        # Fallback dummy data if table is empty
        base_loads = [45, 60, 0, 75, 50, 90, 0, 55, 70, 0, 65, 85, 110, 0, 50, 60, 0, 95, 40, 120, 0, 65, 80, 0, 70, 90, 105, 78]
        from .calculations import calculate_acwr
        for i in range(28):
            window = base_loads[: i + 1]
            res = calculate_acwr(window)
            history.append({
                "day": f"Day {i + 1}",
                "date": f"09-{i+5:02d}" if i < 27 else "Today",
                "trimp": base_loads[i],
                "acute": res.acute_load_7d,
                "chronic": res.chronic_load_28d,
                "acwr": res.acwr,
            })

    latest = history[-1]
    val = latest["acwr"]
    status_label = "sweet_spot"
    if val < 0.8:
        status_label = "undertraining"
    elif val > 1.5:
        status_label = "danger"
    elif val > 1.3:
        status_label = "overreaching"

    return {
        "history": history,
        "currentAcwr": latest["acwr"],
        "acuteLoad7d": latest["acute"],
        "chronicLoad28d": latest["chronic"],
        "status": status_label,
    }


@app.post("/api/v1/activities/process", tags=["Activities"])
async def trigger_process_activity(body: ActivityProcessRequest):
    result = await process_activity_pipeline(
        activity_id=body.activityId,
        athlete_id=body.athleteId,
    )
    return {
        "success": True,
        "activityId": result["activity_id"],
        "trimpScore": result["trimp_score"],
        "acuteLoad7d": result["acute_load_7d"],
        "chronicLoad28d": result["chronic_load_28d"],
        "acwr": result["acwr"],
        "status": result["status"],
    }