"""アバター管理ルーター（パーツ生成）"""
import os

from fastapi import APIRouter, HTTPException

from models.schemas import (
    PartsGenerateRequest,
    PartsGenerateResponse,
    SinglePartRegenerateRequest,
    SinglePartRegenerateResponse,
)
from services.parts_generator import PartsGenerator

router = APIRouter(prefix="/api/v1", tags=["avatar"])

_parts_generator: PartsGenerator | None = None


def get_parts_generator() -> PartsGenerator:
    global _parts_generator
    if _parts_generator is None:
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        _parts_generator = PartsGenerator(gemini_api_key=gemini_key)
    return _parts_generator


@router.post("/generate-parts", response_model=PartsGenerateResponse)
async def generate_parts(req: PartsGenerateRequest) -> PartsGenerateResponse:
    try:
        generator = get_parts_generator()
        parts = await generator.generate_all_parts(
            base_image_b64=req.base_image_b64,
            masks=req.masks,
        )
        return PartsGenerateResponse(parts=parts)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"パーツ生成中にエラーが発生しました: {e}",
        ) from e


@router.post("/regenerate-part", response_model=SinglePartRegenerateResponse)
async def regenerate_part(
    req: SinglePartRegenerateRequest,
) -> SinglePartRegenerateResponse:
    try:
        generator = get_parts_generator()
        result = await generator.regenerate_part(
            base_image_b64=req.base_image_b64,
            part_name=req.part_name,
            mask_b64=req.mask_b64,
            reference_parts=req.reference_parts,
        )
        return SinglePartRegenerateResponse(
            part_name=req.part_name,
            image_b64=result,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"パーツ再生成中にエラーが発生しました: {e}",
        ) from e
