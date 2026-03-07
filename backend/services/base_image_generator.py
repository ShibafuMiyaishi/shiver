"""STAGE 1: ベース画像生成"""
import asyncio
import base64
import logging
import random
import re
import sys

import httpx
from google import genai
from google.genai import types

# UTF-8ログ設定
logger = logging.getLogger("shiver.BaseImageGenerator")
if not logger.handlers:
    logger.setLevel(logging.DEBUG)
    _h = logging.StreamHandler(
        stream=open(sys.stdout.fileno(), mode="w", encoding="utf-8", closefd=False)
    )
    _h.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s %(message)s", "%H:%M:%S"))
    logger.addHandler(_h)


def _parse_retry_delay(error_str: str) -> float:
    """429エラーからAPIが指定するretryDelayを抽出する"""
    match = re.search(r"retry.*?(\d+\.?\d*)s", error_str)
    if match:
        return float(match.group(1))
    return 15.0  # デフォルト15秒


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
        # Gemini clientは1回だけ作成して使い回す
        if gemini_api_key and gemini_api_key != "your_google_ai_studio_api_key_here":
            self._gemini_client = genai.Client(api_key=gemini_api_key)
            self._gemini_async = self._gemini_client.aio
        else:
            self._gemini_client = None
            self._gemini_async = None

    async def generate(self, prompt: str, num_images: int = 4) -> dict:
        # Gemini優先
        if self._gemini_async:
            try:
                images = await self._generate_gemini(prompt, num_images)
                if images:
                    logger.info(f"Gemini生成成功: {len(images)}枚")
                    return {"images": images, "backend_used": "gemini"}
                logger.warning("Gemini: 画像が0枚（クォータ超過の可能性）")
            except Exception as e:
                logger.error(f"Gemini失敗 → SDにフォールバック: {e}")

        # SDフォールバック
        try:
            images = await self._generate_sd(prompt, num_images)
            logger.info(f"SD生成成功: {len(images)}枚")
            return {"images": images, "backend_used": "stable_diffusion"}
        except Exception as e:
            logger.error(f"SDも失敗: {e}")
            raise RuntimeError(
                f"ベース画像生成に失敗しました（Gemini・SDともに失敗）: {e}"
            ) from e

    async def _generate_gemini(
        self, prompt: str, num_images: int
    ) -> list[str]:
        anime_prompt = (
            f"Create a high-quality anime-style 2D illustration. "
            f"Front-facing, upper body, white background. "
            f"VTuber avatar character design with clean lineart, "
            f"vibrant colors, and expressive big eyes. "
            f"Character description: {prompt}"
        )
        # 1枚ずつ順次生成（レート制限回避）
        images: list[str] = []
        for i in range(num_images):
            if i > 0:
                delay = 4.0 + random.uniform(0, 2)
                logger.info(f"次の画像まで{delay:.0f}秒待機 ({i+1}/{num_images}枚目)")
                await asyncio.sleep(delay)
            img = await self._single_gemini_generate(anime_prompt, i + 1)
            if img:
                images.append(img)
                logger.info(f"Gemini {i+1}/{num_images}枚目 生成成功")
            else:
                logger.warning(f"Gemini {i+1}/{num_images}枚目 失敗（スキップ）")
        return images

    async def _single_gemini_generate(
        self, prompt: str, image_num: int = 1
    ) -> str | None:
        """1枚のGemini画像生成。リトライは最大1回（合計2回試行）"""
        for attempt in range(2):
            try:
                response = await self._gemini_async.models.generate_content(
                    model="gemini-2.5-flash-image",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_modalities=["TEXT", "IMAGE"]
                    ),
                )
                for part in response.candidates[0].content.parts:
                    if part.inline_data is not None:
                        return base64.b64encode(part.inline_data.data).decode()
                logger.warning(f"画像{image_num}: レスポンスに画像データなし")
                return None
            except Exception as e:
                error_str = str(e).lower()
                if "429" in error_str or "rate" in error_str or "quota" in error_str:
                    if attempt >= 1:
                        logger.error(f"画像{image_num}: クォータ超過。リトライ停止")
                        return None
                    wait = _parse_retry_delay(error_str) + random.uniform(1, 3)
                    logger.warning(f"画像{image_num}: レート制限 → {wait:.0f}秒待機後リトライ")
                    await asyncio.sleep(wait)
                    continue
                logger.error(f"画像{image_num}: Gemini生成失敗: {e}")
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
