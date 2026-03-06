"""SAM2マスク生成サービス（BBox対応・マスク膨張処理）"""
import base64
from io import BytesIO

import cv2
import httpx
import numpy as np
from PIL import Image


def normalized_to_pixel(
    lm_x: float, lm_y: float, img_w: int, img_h: int
) -> list[float]:
    """MediaPipe正規化座標(0.0~1.0) → ピクセル座標変換"""
    return [lm_x * img_w, lm_y * img_h]


def compute_bbox_from_landmarks(
    landmarks: list[dict],
    indices: list[int],
    img_w: int,
    img_h: int,
    padding_ratio: float = 0.15,
) -> list[float]:
    """ランドマーク群からBBox(x1,y1,x2,y2)を計算。パディング付き。"""
    points = [
        normalized_to_pixel(landmarks[i]["x"], landmarks[i]["y"], img_w, img_h)
        for i in indices
        if i < len(landmarks)
    ]
    if not points:
        return [0, 0, img_w, img_h]

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x1, y1 = min(xs), min(ys)
    x2, y2 = max(xs), max(ys)

    w = x2 - x1
    h = y2 - y1
    pad_x = w * padding_ratio
    pad_y = h * padding_ratio

    return [
        max(0, x1 - pad_x),
        max(0, y1 - pad_y),
        min(img_w, x2 + pad_x),
        min(img_h, y2 + pad_y),
    ]


def dilate_mask(mask_b64: str, dilation_px: int = 3) -> str:
    """SAM2マスクを指定ピクセル数だけ膨張させる"""
    mask_bytes = base64.b64decode(mask_b64)
    mask_img = Image.open(BytesIO(mask_bytes)).convert("L")
    mask_np = np.array(mask_img)

    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (dilation_px * 2 + 1, dilation_px * 2 + 1)
    )
    dilated = cv2.dilate(mask_np, kernel, iterations=1)

    dilated_img = Image.fromarray(dilated)
    buf = BytesIO()
    dilated_img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


LANDMARK_TO_PARTS: dict[str, list[int]] = {
    "face": [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288],
    "nose": [1, 2, 5, 4, 19, 94],
    "mouth": [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
    "left_white": [
        33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159,
        160, 161, 246,
    ],
    "right_white": [
        362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387,
        386, 385, 384, 398,
    ],
    "left_pupil": [468, 469, 470, 471, 472],
    "right_pupil": [473, 474, 475, 476, 477],
    "left_upper_lid": [159, 160, 161, 246, 33, 130, 7, 163],
    "right_upper_lid": [386, 385, 384, 398, 362, 359, 382, 381],
    "left_brow": [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
    "right_brow": [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
    "blush_left": [116, 117, 118, 119, 100, 47, 114, 188],
    "blush_right": [345, 346, 347, 348, 329, 277, 343, 412],
    "hair_back": [10, 338, 297, 332, 284, 251],
    "hair_front": [10, 338, 109, 67, 103, 54],
    "hair_side_left": [234, 93, 132, 58, 172],
    "hair_side_right": [454, 323, 361, 288, 397],
}


async def auto_segment_all_parts(
    image_b64: str,
    landmarks: list[dict],
    img_width: int,
    img_height: int,
    gpu_server_url: str,
) -> dict:
    """全パーツを自動セグメンテーション（BBox対応）"""
    results: dict = {}
    async with httpx.AsyncClient(timeout=60.0) as client:
        for part_name, indices in LANDMARK_TO_PARTS.items():
            points = [
                normalized_to_pixel(
                    landmarks[i]["x"], landmarks[i]["y"], img_width, img_height
                )
                for i in indices
                if i < len(landmarks)
            ]
            if not points:
                results[part_name] = {
                    "error": "ランドマークが不足",
                    "mask_b64": None,
                }
                continue

            is_hair_part = part_name.startswith("hair_")
            padding = 0.25 if is_hair_part else 0.15
            bbox = compute_bbox_from_landmarks(
                landmarks, indices, img_width, img_height, padding_ratio=padding
            )

            try:
                res = await client.post(
                    f"{gpu_server_url}/segment",
                    json={
                        "image_b64": image_b64,
                        "points": points,
                        "labels": [1] * len(points),
                        "bbox": bbox,
                        "part_name": part_name,
                    },
                )
                res.raise_for_status()
                data = res.json()
                if data.get("mask_b64"):
                    data["mask_b64"] = dilate_mask(data["mask_b64"], dilation_px=3)
                results[part_name] = data
            except Exception as e:
                results[part_name] = {"error": str(e), "mask_b64": None}
    return results
