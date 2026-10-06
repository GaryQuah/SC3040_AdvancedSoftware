import io
import sqlite3
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import nutrition_demo as demo


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(demo, "DB_PATH", tmp_path / "meals.sqlite3")
    with TestClient(demo.app) as api:
        yield api


def meal():
    return {
        "id": str(uuid4()),
        "meal_name": "Local rice",
        "meal_type": "lunch",
        "logged_at": "2026-10-06T17:00:00Z",
        "confidence_score": 0,
        "training_context_note": "Manual meal",
        "items": [
            {
                "name": "Rice",
                "estimated_weight_g": 100,
                "calories": 130,
                "protein_g": 3,
                "carbs_g": 28,
                "fat_g": 0.2,
            }
        ],
    }


def test_persistence_retry_and_restart(client):
    body = meal()
    assert client.post("/api/nutrition/meals", json=body).status_code == 201
    assert client.post("/api/nutrition/meals", json=body).status_code == 201
    with sqlite3.connect(demo.DB_PATH) as db:
        assert db.execute("SELECT count(*) FROM meals").fetchone()[0] == 1
    with TestClient(demo.app) as restarted:
        result = restarted.get(
            "/api/nutrition/daily?day=2026-10-07&offset_minutes=480"
        ).json()
    assert result["meals"][0]["id"] == body["id"]
    assert result["total_calories"] == 130
    assert result["net_energy"] == 130 - 1650 - 400
    assert (
        client.get("/api/nutrition/daily?day=2026-10-07&offset_minutes=0").json()[
            "meals"
        ]
        == []
    )


def test_delete_updates_totals(client):
    body = meal()
    client.post("/api/nutrition/meals", json=body)
    assert client.delete(f"/api/nutrition/meals/{body['id']}").status_code == 204
    assert (
        client.get("/api/nutrition/daily?day=2026-10-07&offset_minutes=480").json()[
            "total_calories"
        ]
        == 0
    )
    assert client.delete(f"/api/nutrition/meals/{body['id']}").status_code == 404


def test_sample_analysis_and_bad_image(client):
    image = io.BytesIO()
    Image.new("RGB", (20, 20), "green").save(image, format="PNG")
    result = client.post(
        "/api/nutrition/analyze",
        files={"file": ("meal.png", image.getvalue(), "image/png")},
    )
    assert result.status_code == 200
    assert result.json()["total_calories"] == 421
    assert "SAMPLE DATA" in result.json()["training_context_note"]
    assert (
        client.post(
            "/api/nutrition/analyze", files={"file": ("meal.png", b"bad", "image/png")}
        ).status_code
        == 400
    )


@pytest.mark.parametrize(
    "change", [{"user_id": "forged"}, {"items": []}, {"total_calories": 1}]
)
def test_same_validation_as_live_backend(client, change):
    assert (
        client.post("/api/nutrition/meals", json={**meal(), **change}).status_code
        == 422
    )


def test_rejects_nonlocal_clients():
    with TestClient(demo.app, client=("203.0.113.1", 5000)) as api:
        assert api.get("/health").status_code == 403


def test_health_without_credentials(client):
    assert client.get("/health").json()["storage"] == "sqlite"
