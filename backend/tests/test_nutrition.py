import io
import json
import os
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError

os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

from app.commons.auth.deps import get_current_user_id
from app.controllers import nutrition as controller
from app.models.nutrition import FoodItem, MealAnalysis, MealCreate
from app.services import nutrition

USER = "00000000-0000-0000-0000-000000000001"
OTHER = "00000000-0000-0000-0000-000000000002"


def payload():
    return {
        "id": str(uuid4()),
        "meal_name": "Rice bowl",
        "meal_type": "lunch",
        "logged_at": "2026-10-07T04:00:00Z",
        "confidence_score": 0.8,
        "training_context_note": "Estimated recovery meal.",
        "items": [
            {
                "name": "Rice",
                "estimated_weight_g": 150,
                "calories": 195,
                "protein_g": 4,
                "carbs_g": 42,
                "fat_g": 0.5,
            }
        ],
    }


class Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.filters = []
        self.op, self.payload = "select", None

    def select(self, *_):
        return self

    def eq(self, key, value):
        self.filters.append(lambda row: row.get(key) == value)
        return self

    def gte(self, key, value):
        self.filters.append(lambda row: row[key] >= value)
        return self

    def lt(self, key, value):
        self.filters.append(lambda row: row[key] < value)
        return self

    def order(self, *_, **__):
        return self

    def limit(self, *_):
        return self

    def insert(self, value):
        self.op, self.payload = "insert", value
        return self

    def delete(self):
        self.op = "delete"
        return self

    def execute(self):
        rows = self.db.rows.setdefault(self.table, [])
        if self.op == "insert":
            rows.append(self.payload)
            return SimpleNamespace(data=[self.payload])
        selected = [row for row in rows if all(test(row) for test in self.filters)]
        if self.op == "delete":
            self.db.rows[self.table] = [row for row in rows if row not in selected]
        return SimpleNamespace(data=selected)


class Database:
    def __init__(self):
        self.rows = {}

    def table(self, name):
        return Query(self, name)


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(controller.router)
    db = Database()
    app.dependency_overrides[get_current_user_id] = lambda: USER
    monkeypatch.setattr(controller, "get_supabase_admin", lambda: db)
    with TestClient(app) as test_client:
        yield test_client, db


def image_bytes(format="PNG"):
    output = io.BytesIO()
    Image.new("RGB", (20, 20), "green").save(output, format=format)
    return output.getvalue()


def test_auth_required():
    app = FastAPI()
    app.include_router(controller.router)
    with TestClient(app) as client:
        for method, path in [
            ("GET", "/daily?day=2026-10-07"),
            ("POST", "/analyze"),
            ("POST", "/meals"),
            ("DELETE", f"/meals/{uuid4()}"),
        ]:
            assert client.request(method, f"/api/nutrition{path}").status_code in {
                401,
                403,
            }


@pytest.mark.parametrize("format", ["PNG", "JPEG", "WEBP", "HEIF"])
def test_normalizes_supported_images(format):
    result = nutrition.normalize_image(image_bytes(format))
    with Image.open(io.BytesIO(result)) as image:
        assert image.format == "JPEG"
        assert image.size == (20, 20)


@pytest.mark.parametrize("content", [b"", b"not an image", b"<svg></svg>"])
def test_rejects_invalid_image(content):
    with pytest.raises(HTTPException) as exc:
        nutrition.normalize_image(content)
    assert exc.value.status_code == 400


def test_upload_validation(client, monkeypatch):
    api, _ = client
    spy = AsyncMock()
    monkeypatch.setattr(nutrition, "analyze_image", spy)
    for body, mime, expected in [
        (b"x", "text/plain", 415),
        (b"bad", "image/png", 400),
        (b"x" * (nutrition.MAX_UPLOAD_BYTES + 1), "image/png", 413),
    ]:
        assert (
            api.post(
                "/api/nutrition/analyze", files={"file": ("meal.png", body, mime)}
            ).status_code
            == expected
        )
    spy.assert_not_called()


def test_analyze_preserves_notes_without_saving(client, monkeypatch):
    api, db = client
    data = payload()
    estimate = MealAnalysis(
        **{
            key: data[key]
            for key in (
                "meal_name",
                "confidence_score",
                "training_context_note",
                "items",
            )
        },
        **nutrition.totals([FoodItem(**data["items"][0])]),
    )
    spy = AsyncMock(return_value=estimate)
    monkeypatch.setattr(nutrition, "analyze_image", spy)
    result = api.post(
        "/api/nutrition/analyze",
        files={"file": ("meal.png", image_bytes(), "image/png")},
        data={"notes": "After a run"},
    )
    assert result.status_code == 200
    assert result.json()["total_calories"] == 195
    assert spy.call_args.args[1] == "After a run"
    assert not db.rows


def test_save_recalculates_and_is_idempotent(client):
    api, db = client
    body = payload()
    body["items"].append({**body["items"][0], "name": "More rice"})
    first = api.post("/api/nutrition/meals", json=body)
    second = api.post("/api/nutrition/meals", json=body)
    assert first.status_code == second.status_code == 201
    assert first.json()["total_calories"] == 390
    assert len(db.rows["meals"]) == 1
    assert db.rows["meals"][0]["user_id"] == USER


@pytest.mark.parametrize(
    "changes",
    [
        {"user_id": OTHER},
        {"total_calories": 1},
        {"items": []},
        {"confidence_score": 2},
        {"meal_type": "other"},
        {"logged_at": "2026-10-07T12:00:00"},
    ],
)
def test_rejects_invalid_or_spoofed_save(client, changes):
    api, _ = client
    assert (
        api.post("/api/nutrition/meals", json={**payload(), **changes}).status_code
        == 422
    )


@pytest.mark.parametrize(
    "key,value",
    [
        ("estimated_weight_g", 0),
        ("calories", -1),
        ("protein_g", float("nan")),
        ("name", " "),
    ],
)
def test_food_bounds(key, value):
    with pytest.raises(ValidationError):
        FoodItem(**{**payload()["items"][0], key: value})


def test_daily_timezone_energy_and_ownership(client):
    api, db = client
    nutrition.save_meal(
        db, USER, MealCreate(**{**payload(), "logged_at": "2026-10-06T17:00:00+00:00"})
    )
    nutrition.save_meal(
        db, USER, MealCreate(**{**payload(), "logged_at": "2026-10-07T16:00:00+00:00"})
    )
    nutrition.save_meal(db, OTHER, MealCreate(**payload()))
    db.rows["users"] = [
        {
            "user_id": USER,
            "weight": 70,
            "height": 175,
            "age": 30,
            "biological_sex": "MALE",
        }
    ]
    db.rows["activities"] = [
        {"user_id": USER, "start_date": "2026-10-07T01:00:00+00:00", "calories": 400},
        {"user_id": OTHER, "start_date": "2026-10-07T01:00:00+00:00", "calories": 900},
    ]
    result = api.get("/api/nutrition/daily?day=2026-10-07&offset_minutes=480").json()
    assert len(result["meals"]) == 1
    assert result["total_calories"] == 195
    assert result["bmr"] == 1649
    assert result["active_calories"] == 400
    assert result["net_energy"] == 195 - 1649 - 400


def test_missing_energy_data_is_not_zero(client):
    _, db = client
    result = nutrition.daily_log(db, USER, date(2026, 10, 7), 0)
    assert result["bmr"] is result["active_calories"] is result["net_energy"] is None
    assert result["total_calories"] == 0


def test_delete_only_owned_meal(client):
    api, db = client
    mine, other = MealCreate(**payload()), MealCreate(**payload())
    nutrition.save_meal(db, USER, mine)
    nutrition.save_meal(db, OTHER, other)
    assert api.delete(f"/api/nutrition/meals/{other.id}").status_code == 404
    assert api.delete(f"/api/nutrition/meals/{mine.id}").status_code == 204
    assert len(db.rows["meals"]) == 1


@pytest.mark.asyncio
async def test_missing_ai_key(monkeypatch):
    monkeypatch.setattr(
        nutrition,
        "get_settings",
        lambda: SimpleNamespace(GOOGLE_GENERATIVE_AI_API_KEY=""),
    )
    with pytest.raises(HTTPException) as exc:
        await nutrition.analyze_image(image_bytes(), "")
    assert exc.value.status_code == 503


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "scenario,expected",
    [
        ("valid", 200),
        ("empty", 422),
        ("invalid", 422),
        ("timeout", 504),
        ("quota", 429),
    ],
)
async def test_gemini_response_handling(monkeypatch, scenario, expected):
    data = payload()
    estimate = {
        key: data[key]
        for key in ("meal_name", "confidence_score", "training_context_note", "items")
    }
    if scenario == "empty":
        estimate["items"] = []
    response_text = "not JSON" if scenario == "invalid" else json.dumps(estimate)
    generate = AsyncMock(return_value=SimpleNamespace(text=response_text))
    if scenario == "timeout":
        generate.side_effect = TimeoutError()
    if scenario == "quota":
        generate.side_effect = nutrition.errors.ClientError(
            429, {"error": {"message": "quota"}}
        )

    class AsyncClient:
        models = SimpleNamespace(generate_content=generate)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

    monkeypatch.setattr(
        nutrition,
        "get_settings",
        lambda: SimpleNamespace(
            GOOGLE_GENERATIVE_AI_API_KEY="fixture-key",
            GEMINI_NUTRITION_MODEL="fixture-model",
        ),
    )
    monkeypatch.setattr(
        nutrition.genai, "Client", lambda **_: SimpleNamespace(aio=AsyncClient())
    )
    if expected != 200:
        with pytest.raises(HTTPException) as exc:
            await nutrition.analyze_image(image_bytes(), "after run")
        assert exc.value.status_code == expected
    else:
        result = await nutrition.analyze_image(image_bytes(), "after run")
        assert result.total_calories == 195
        assert result.protein_g == 4
        assert generate.call_args.kwargs["model"] == "fixture-model"
