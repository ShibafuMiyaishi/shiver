"""画像生成ルーター"""
import os

from fastapi import APIRouter, HTTPException

from models.schemas import GenerateRequest, GenerateResponse
from services.base_image_generator import BaseImageGenerator

router = APIRouter(prefix="/api/v1", tags=["generation"])

_generator: BaseImageGenerator | None = None


def get_generator() -> BaseImageGenerator:
    global _generator
    if _generator is None:
        sd_host = os.getenv("GPU_SERVER_HOST", "localhost")
        sd_port = os.getenv("GPU_SERVER_SD_PORT", "7860")
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        _generator = BaseImageGenerator(
            sd_url=f"http://{sd_host}:{sd_port}",
            gemini_api_key=gemini_key,
        )
    return _generator


@router.post("/generate", response_model=GenerateResponse)
async def generate_images(req: GenerateRequest) -> GenerateResponse:
    try:
        generator = get_generator()
        result = await generator.generate(req.prompt, req.num_images)
        return GenerateResponse(**result)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"画像生成中に予期しないエラーが発生しました: {e}",
        ) from e
