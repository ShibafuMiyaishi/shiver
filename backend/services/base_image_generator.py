"""STAGE 1: ベース画像生成"""
import asyncio
import base64
import random

import httpx
from google import genai
from google.genai import types


class BaseImageGenerator:
    """Gemini優先、SD WebUIフォールバック"""

    # Illustrious XL v2.0 (SDXL) 用設定 — VRAM 8GB向け解像度
    SD_DEFAULT_PARAMS = {
        "steps": 25,
        "width": 640,
        "height": 960,
        "cfg_scale": 6,
        "sampler_name": "Euler a",
    }
    SD_POSITIVE_PREFIX = (
        "masterpiece, best quality, absurdres, "
        "1girl, solo, front facing, upper body, white background, "
        "anime style, clean lineart, vibrant colors, "
    )
    SD_NEGATIVE = (
        "worst quality, low quality, normal quality, lowres, "
        "bad anatomy, bad hands, extra fingers, fewer fingers, "
        "text, signature, watermark, username, blurry, "
        "3d, realistic, photorealistic, multiple views, "
        "sketch, monochrome, greyscale"
    )

    def __init__(self, sd_url: str, gemini_api_key: str) -> None:
        self.sd_url = sd_url
        self.gemini_api_key = gemini_api_key

    async def generate(self, prompt: str, num_images: int = 4) -> dict:
        # Gemini優先
        if self.gemini_api_key and self.gemini_api_key != "your_google_ai_studio_api_key_here":
            try:
                images = await self._generate_gemini(prompt, num_images)
                if images:
                    return {"images": images, "backend_used": "gemini"}
            except Exception as e:
                print(f"[BaseImageGenerator] Gemini失敗 → SDにフォールバック: {e}")

        # SDフォールバック
        try:
            images = await self._generate_sd(prompt, num_images)
            return {"images": images, "backend_used": "stable_diffusion"}
        except Exception as e:
            raise RuntimeError(
                f"ベース画像生成に失敗しました（Gemini・SDともに失敗）: {e}"
            ) from e

    async def _generate_gemini(
        self, prompt: str, num_images: int
    ) -> list[str]:
        sync_client = genai.Client(api_key=self.gemini_api_key)
        async_client = sync_client.aio
        anime_prompt = (
            f"Create a high-quality anime-style 2D illustration. "
            f"Front-facing, upper body, white background. "
            f"VTuber avatar character design with clean lineart, "
            f"vibrant colors, and expressive big eyes. "
            f"Character description: {prompt}"
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
        for attempt in range(5):
            try:
                response = await async_client.models.generate_content(
                    model="gemini-2.5-flash-image",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE"]
                    ),
                )
                for part in response.candidates[0].content.parts:
                    if part.inline_data is not None:
                        return base64.b64encode(part.inline_data.data).decode()
            except Exception as e:
                error_str = str(e).lower()
                if "429" in error_str or "rate" in error_str or "quota" in error_str:
                    wait = 2.0 * (2 ** attempt) + random.uniform(0, 1)
                    print(f"[BaseImageGenerator] レート制限 → {wait:.1f}秒後にリトライ ({attempt + 1}/5)")
                    await asyncio.sleep(wait)
                    continue
                print(f"[BaseImageGenerator] Gemini生成失敗: {e}")
                return None
        return None

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
