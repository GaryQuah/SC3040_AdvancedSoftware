"""Local-only nutrition sandbox with persistent SQLite storage and sample analysis."""

import json
import os
import sqlite3
from contextlib import closing, contextmanager
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app.models.nutrition import FoodItem, MealAnalysis, MealCreate, MealRecord
from app.services.nutrition import (
    MAX_UPLOAD_BYTES,
    SUPPORTED_TYPES,
    normalize_image,
    totals,
)

if os.environ.get("ENVIRONMENT", "development") not in {"development", "test"}:
    raise RuntimeError(
        "The nutrition demo backend is only available in development/test."
    )

DB_PATH = Path(
    os.environ.get(
        "NUTRITION_DEMO_DB_PATH",
        str(Path(__file__).resolve().parents[1] / ".local" / "nutrition-demo.sqlite3"),
    )
)

app = FastAPI(title="FITRA Nutrition Demo — local test data")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def local_only(request: Request, call_next):
    if not request.client or request.client.host not in {
        "127.0.0.1",
        "::1",
        "testclient",
    }:
        return JSONResponse(
            {"detail": "Demo mode only accepts local connections."}, status_code=403
        )
    return await call_next(request)


@contextmanager
def database():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DB_PATH, timeout=10)) as db, db:
        db.execute(
            "CREATE TABLE IF NOT EXISTS meals (id TEXT PRIMARY KEY, logged_at REAL NOT NULL, payload TEXT NOT NULL)"
        )
        db.execute("CREATE INDEX IF NOT EXISTS meals_logged_at ON meals(logged_at)")
        yield db


@app.get("/health")
def health():
    with database() as db:
        db.execute("SELECT 1")
    return {"status": "healthy", "mode": "nutrition-demo", "storage": "sqlite"}


@app.post("/api/nutrition/analyze", response_model=MealAnalysis)
async def analyze(
    file: Annotated[UploadFile, File()], notes: str = Form(default="", max_length=1000)
):
    try:
        if file.content_type not in SUPPORTED_TYPES:
            raise HTTPException(415, "Use JPEG, PNG, WEBP or HEIC/HEIF.")
        content = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "Image exceeds the 10 MB limit.")
        await run_in_threadpool(normalize_image, content)
    finally:
        await file.close()
    items = [
        FoodItem(
            name="Grilled chicken (sample)",
            estimated_weight_g=120,
            calories=198,
            protein_g=37.2,
            carbs_g=0,
            fat_g=4.3,
        ),
        FoodItem(
            name="Cooked rice (sample)",
            estimated_weight_g=150,
            calories=195,
            protein_g=4,
            carbs_g=42,
            fat_g=0.5,
        ),
        FoodItem(
            name="Broccoli (sample)",
            estimated_weight_g=80,
            calories=28,
            protein_g=2.4,
            carbs_g=5.6,
            fat_g=0.3,
        ),
    ]
    return MealAnalysis(
        meal_name="Sample chicken & rice bowl",
        confidence_score=0.85,
        training_context_note="SAMPLE DATA: This fixed result is for testing the review flow. It does not describe your photo or use your notes. No AI service was called.",
        items=items,
        **totals(items),
    )


@app.post("/api/nutrition/meals", response_model=MealRecord, status_code=201)
def save(body: MealCreate):
    meal = MealRecord(**body.model_dump(), **totals(body.items))
    with database() as db:
        db.execute(
            "INSERT INTO meals(id, logged_at, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
            (str(body.id), body.logged_at.timestamp(), meal.model_dump_json()),
        )
        row = db.execute(
            "SELECT payload FROM meals WHERE id = ?", (str(body.id),)
        ).fetchone()
    return json.loads(row[0])


@app.get("/api/nutrition/daily")
def daily(day: date, offset_minutes: int = Query(default=0, ge=-720, le=840)):
    start = datetime.combine(day, time.min, timezone(timedelta(minutes=offset_minutes)))
    with database() as db:
        rows = db.execute(
            "SELECT payload FROM meals WHERE logged_at >= ? AND logged_at < ? ORDER BY logged_at DESC",
            (start.timestamp(), (start + timedelta(days=1)).timestamp()),
        ).fetchall()
    meals = [MealRecord.model_validate_json(row[0]) for row in rows]
    values = totals([item for meal in meals for item in meal.items])
    return {
        "date": day.isoformat(),
        "meals": meals,
        **values,
        "bmr": 1650,
        "active_calories": 400,
        "net_energy": round(values["total_calories"] - 1650 - 400, 1),
    }


@app.delete("/api/nutrition/meals/{meal_id}", status_code=204)
def delete(meal_id: UUID):
    with database() as db:
        result = db.execute("DELETE FROM meals WHERE id = ?", (str(meal_id),))
        if result.rowcount == 0:
            raise HTTPException(404, "Meal not found.")
