"""shiver バックエンド - FastAPIアプリケーション"""
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import generation, segmentation, avatar

load_dotenv()

app = FastAPI(title="shiver", version="0.2.0")

cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generation.router)
app.include_router(segmentation.router)
app.include_router(avatar.router)


@app.get("/health")
async def health_check() -> dict:
    """ヘルスチェックエンドポイント"""
    return {"status": "ok", "version": "0.2.0"}
