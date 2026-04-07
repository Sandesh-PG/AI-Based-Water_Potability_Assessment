from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes.forecast import router as forecast_router
from backend.routes.locations import router as locations_router

app = FastAPI(title="Water Quality API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(locations_router)
app.include_router(forecast_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Water Quality API Running"}
