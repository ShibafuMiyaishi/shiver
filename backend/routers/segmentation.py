"""セグメンテーションルーター"""
import os

from fastapi import APIRouter, HTTPException

from models.schemas import SegmentRequest, SegmentResponse
from services.sam2_service import auto_segment_all_parts

router = APIRouter(prefix="/api/v1", tags=["segmentation"])


@router.post("/segment", response_model=SegmentResponse)
async def segment_parts(req: SegmentRequest) -> SegmentResponse:
    try:
        host = os.getenv("GPU_SERVER_HOST", "localhost")
        port = os.getenv("GPU_SERVER_SAM2_PORT", "8001")
        gpu_url = f"http://{host}:{port}"

        results = await auto_segment_all_parts(
            image_b64=req.image_b64,
            landmarks=req.landmarks,
            img_width=req.img_width,
            img_height=req.img_height,
            gpu_server_url=gpu_url,
        )
        return SegmentResponse(results=results)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"セグメンテーション中にエラーが発生しました: {e}",
        ) from e
