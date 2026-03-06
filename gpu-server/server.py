"""shiver GPU Server - SAM2推論サーバー"""
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="shiver GPU Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SAM2モデルの遅延ロード
sam2_predictor = None


def get_sam2_predictor():
    """SAM2モデルを遅延ロードする"""
    global sam2_predictor
    if sam2_predictor is not None:
        return sam2_predictor
    try:
        import torch
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[GPU Server] 使用デバイス: {device}")

        checkpoint = os.path.join(
            os.path.dirname(__file__), "checkpoints", "sam2_hiera_large.pt"
        )
        if not os.path.exists(checkpoint):
            print(f"[GPU Server] チェックポイント未検出: {checkpoint}")
            return None

        model = build_sam2("sam2_hiera_l.yaml", checkpoint, device=device)
        sam2_predictor = SAM2ImagePredictor(model)
        print("[GPU Server] SAM2モデルロード完了")
        return sam2_predictor
    except ImportError:
        print("[GPU Server] SAM2未インストール。モックモードで動作します。")
        return None
    except Exception as e:
        print(f"[GPU Server] SAM2ロード失敗: {e}")
        return None


class SegmentRequest(BaseModel):
    image_b64: str
    points: list[list[float]]
    labels: list[int]
    bbox: list[float] | None = None
    part_name: str


class SegmentResponse(BaseModel):
    mask_b64: str | None
    part_name: str
    error: str | None = None


@app.get("/health")
async def health_check() -> dict:
    """ヘルスチェックエンドポイント"""
    import torch

    cuda_available = torch.cuda.is_available()
    device_name = torch.cuda.get_device_name(0) if cuda_available else "CPU"
    predictor = get_sam2_predictor()
    return {
        "status": "ok",
        "version": "0.1.0",
        "cuda_available": cuda_available,
        "device": device_name,
        "sam2_loaded": predictor is not None,
    }


@app.post("/segment", response_model=SegmentResponse)
async def segment(req: SegmentRequest) -> SegmentResponse:
    """SAM2でセグメンテーションを実行"""
    import base64
    from io import BytesIO

    import numpy as np
    from PIL import Image

    predictor = get_sam2_predictor()

    if predictor is None:
        return SegmentResponse(
            mask_b64=None,
            part_name=req.part_name,
            error="SAM2モデルが利用できません。チェックポイントを確認してください。",
        )

    try:
        img_bytes = base64.b64decode(req.image_b64)
        img = Image.open(BytesIO(img_bytes)).convert("RGB")
        img_np = np.array(img)

        predictor.set_image(img_np)

        points_np = np.array(req.points)
        labels_np = np.array(req.labels)

        kwargs: dict = {
            "point_coords": points_np,
            "point_labels": labels_np,
            "multimask_output": False,
        }

        # v3.2: BBoxがあればSAM2に渡す（アニメドメインギャップ対策）
        if req.bbox is not None:
            import torch

            kwargs["box"] = torch.tensor(req.bbox, dtype=torch.float32)

        masks, scores, _ = predictor.predict(**kwargs)
        mask = masks[0]

        mask_img = Image.fromarray((mask * 255).astype(np.uint8))
        buf = BytesIO()
        mask_img.save(buf, format="PNG")
        mask_b64 = base64.b64encode(buf.getvalue()).decode()

        return SegmentResponse(
            mask_b64=mask_b64,
            part_name=req.part_name,
        )
    except Exception as e:
        return SegmentResponse(
            mask_b64=None,
            part_name=req.part_name,
            error=f"セグメンテーション失敗: {e}",
        )
