"""STAGE 1: ベース画像生成"""
import asyncio
import base64

import httpx
from google import genai
from google.genai import types


class BaseImageGenerator:
    """SD WebUI優先、Gemini 2.5 Flash Imageフォールバック"""

    SD_DEFAULT_PARAMS = {
        "steps": 28,
        "width": 512,
        "height": 768,
        "cfg_scale": 7,
        "sampler_name": "DPM++ 2M Karras",
    }
    SD_POSITIVE_PREFIX = (
        "masterpiece, best quality, ultra-detailed, anime style, "
        "2d illustration, character design sheet, white background, "
        "front facing, upper body, colorful hair, big eyes, cute face, "
        "clean lineart, flat color, "
    )
    SD_NEGATIVE = (
        "lowres, bad anatomy, bad hands, text, error, missing fingers, "
        "extra digit, fewer digits, cropped, worst quality, low quality, "
        "jpeg artifacts, signature, watermark, blurry, bad face, "
        "deformed face, multiple faces, 3d, realistic, photorealistic"
    )

    def __init__(self, sd_url: str, gemini_api_key: str) -> None:
        self.sd_url = sd_url
        self.gemini_api_key = gemini_api_key

    async def generate(self, prompt: str, num_images: int = 4) -> dict:
        try:
            images = await self._generate_sd(prompt, num_images)
            return {"images": images, "backend_used": "stable_diffusion"}
        except Exception as e:
            print(f"[BaseImageGenerator] SD失敗 → Geminiにフォールバック: {e}")

        try:
            images = await self._generate_gemini_fallback(prompt, num_images)
            return {"images": images, "backend_used": "gemini_fallback"}
        except Exception as e:
            raise RuntimeError(
                f"ベース画像生成に失敗しました（SD・Geminiともに失敗）: {e}"
            ) from e

    async def _generate_sd(self, prompt: str, num_images: int) -> list[str]:
        payload = {
            "prompt": self.SD_POSITIVE_PREFIX + prompt,
            "negative_prompt": self.SD_NEGATIVE,
            "batch_size": num_images,
            **self.SD_DEFAULT_PARAMS,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(
                f"{self.sd_url}/sdapi/v1/txt2img", json=payload
            )
            res.raise_for_status()
            return res.json()["images"]

    async def _generate_gemini_fallback(
        self, prompt: str, num_images: int
    ) -> list[str]:
        sync_client = genai.Client(api_key=self.gemini_api_key)
        async_client = sync_client.aio
        anime_prompt = (
            f"アニメスタイルの2Dイラスト、正面向き、上半身、白背景、"
            f"VTuberアバター用キャラクターデザイン、クリーンな線画、"
            f"フラットカラー: {prompt}"
        )
        tasks = [
            self._single_gemini_generate(async_client, anime_prompt)
            for _ in range(num_images)
        ]
        images = await asyncio.gather(*tasks)
        return [img for img in images if img is not None]

    async def _single_gemini_generate(
        self, async_client: genai.Client, prompt: str
    ) -> str | None:
        try:
            response = await async_client.models.generate_content(
                model="gemini-2.5-flash-preview-05-20",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"]
                ),
            )
            for part in response.candidates[0].content.parts:
                if part.inline_data is not None:
                    return base64.b64encode(part.inline_data.data).decode()
        except Exception as e:
            print(f"[BaseImageGenerator] Gemini単体生成失敗: {e}")
        return None
