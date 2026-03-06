"""STAGE 2: パーツ個別生成（v3.2 マスクインペイント方式）"""
import asyncio
import base64
import random
from io import BytesIO

import cv2
import numpy as np
from PIL import Image
from google import genai
from google.genai import types

# モデル設定
EXPERIMENT_MODEL = "gemini-2.5-flash-preview-05-20"
PRODUCTION_MODEL = "gemini-3-pro-image-preview"
CURRENT_MODEL = EXPERIMENT_MODEL


def chroma_key_to_rgba(image_b64: str, part_name: str) -> str:
    """グリーンバック(#00FF00)画像をRGBA透過PNGに変換"""
    img_bytes = base64.b64decode(image_b64)
    img = Image.open(BytesIO(img_bytes))

    if img.mode == "RGBA":
        arr = np.array(img)
        if arr[:, :, 3].min() < 255:
            print(f"[chroma_key] {part_name}: 既にRGBA透過")
            return image_b64

    img_rgb = img.convert("RGB")
    arr_bgr = cv2.cvtColor(np.array(img_rgb), cv2.COLOR_RGB2BGR)
    arr_hsv = cv2.cvtColor(arr_bgr, cv2.COLOR_BGR2HSV)

    lower_green = np.array([50, 180, 180])
    upper_green = np.array([80, 255, 255])
    green_mask = cv2.inRange(arr_hsv, lower_green, upper_green)

    green_ratio = green_mask.mean() / 255
    if green_ratio > 0.1:
        alpha = cv2.bitwise_not(green_mask)
        alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
        arr_rgba = cv2.cvtColor(arr_bgr, cv2.COLOR_BGR2BGRA)
        arr_rgba[:, :, 3] = alpha
        result = Image.fromarray(cv2.cvtColor(arr_rgba, cv2.COLOR_BGRA2RGBA))
        buf = BytesIO()
        result.save(buf, format="PNG")
        print(
            f"[chroma_key] {part_name}: グリーンバック除去 "
            f"(緑比率: {green_ratio:.1%})"
        )
        return base64.b64encode(buf.getvalue()).decode()

    print(
        f"[chroma_key] {part_name}: グリーン未検出 "
        f"(緑比率: {green_ratio:.1%}) → rembg試行"
    )
    try:
        from rembg import remove

        img_rgba = remove(img.convert("RGBA"))
        buf = BytesIO()
        img_rgba.save(buf, format="PNG")
        print(f"[chroma_key] {part_name}: rembg背景除去完了")
        return base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        print(f"[chroma_key] {part_name}: rembg未インストール")
    except Exception as e:
        print(f"[chroma_key] {part_name}: rembg失敗: {e}")

    print(f"[chroma_key] {part_name}: 透過化失敗。手動補正UIで対応してください")
    buf = BytesIO()
    img.convert("RGBA").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


ensure_rgba = chroma_key_to_rgba


async def call_with_retry(
    coro_fn,  # type: ignore[type-arg]
    max_retries: int = 5,
    base_delay: float = 2.0,
):  # type: ignore[return]
    """429エラー時にExponential Backoffで自動リトライ"""
    for attempt in range(max_retries):
        try:
            return await coro_fn()
        except Exception as e:
            error_str = str(e).lower()
            is_rate_limit = (
                "429" in error_str
                or "rate" in error_str
                or "quota" in error_str
            )
            if not is_rate_limit or attempt == max_retries - 1:
                raise
            wait_sec = base_delay * (2**attempt) + random.uniform(0, 1)
            print(
                f"[Retry] レート制限 429。{wait_sec:.1f}秒後にリトライ "
                f"({attempt + 1}/{max_retries})"
            )
            await asyncio.sleep(wait_sec)
    raise RuntimeError("最大リトライ回数に達しました")


PART_PROMPTS: dict[str, str] = {
    "hair_back": "後ろ髪パーツのみを描いてください。背景は純粋なグリーン(#00FF00)。前髪や顔に隠れている部分も含め後ろ髪全体を自然に補完して。",
    "face": "顔・肌パーツのみを描いてください(目・眉・口の穴は肌色で塗りつぶした状態)。背景は純粋なグリーン(#00FF00)。前髪に隠れた額・耳も含め顔全体を補完して。",
    "left_white": "左目の白目パーツのみを描いてください(楕円形・まぶたに隠れる部分も含めて完全な形で)。背景は純粋なグリーン(#00FF00)。",
    "right_white": "右目の白目パーツのみを描いてください(楕円形・まぶたに隠れる部分も含めて完全な形で)。背景は純粋なグリーン(#00FF00)。",
    "left_pupil": "左目の瞳(虹彩・瞳孔)パーツのみを描いてください。背景は純粋なグリーン(#00FF00)。",
    "right_pupil": "右目の瞳(虹彩・瞳孔)パーツのみを描いてください。背景は純粋なグリーン(#00FF00)。",
    "left_upper_lid": "左目の上まぶたパーツのみを描いてください。背景は純粋なグリーン(#00FF00)。",
    "right_upper_lid": "右目の上まぶたパーツのみを描いてください。背景は純粋なグリーン(#00FF00)。",
    "left_brow": "左眉パーツのみを描いてください。背景は純粋なグリーン(#00FF00)。",
    "right_brow": "右眉パーツのみを描いてください。背景は純粋なグリーン(#00FF00)。",
    "nose": "鼻パーツのみを描いてください。背景は純粋なグリーン(#00FF00)。",
    "mouth": "口(閉じた状態)パーツのみを描いてください。背景は純粋なグリーン(#00FF00)。",
    "blush_left": "左頬染めパーツのみを描いてください(半透明グラデーション)。背景は純粋なグリーン(#00FF00)。",
    "blush_right": "右頬染めパーツのみを描いてください(半透明グラデーション)。背景は純粋なグリーン(#00FF00)。",
    "hair_front": "前髪パーツのみを描いてください。背景は純粋なグリーン(#00FF00)。前髪の下に隠れていた額の肌も自然に補完して。",
    "hair_side_left": "左サイド髪パーツのみを描いてください。背景は純粋なグリーン(#00FF00)。横顔に隠れる部分も含めて補完して。",
    "hair_side_right": "右サイド髪パーツのみを描いてください。背景は純粋なグリーン(#00FF00)。横顔に隠れる部分も含めて補完して。",
}


class PartsGenerator:
    """依存グラフに基づくレイヤー順次パーツ生成"""

    GENERATION_LAYERS = [
        {
            "hair_back": {"depends_on": []},
            "blush_left": {"depends_on": []},
            "blush_right": {"depends_on": []},
        },
        {
            "face": {"depends_on": ["hair_back"]},
        },
        {
            "left_white": {"depends_on": ["face"]},
            "right_white": {"depends_on": ["face"]},
            "nose": {"depends_on": ["face"]},
            "mouth": {"depends_on": ["face"]},
            "left_brow": {"depends_on": ["face"]},
            "right_brow": {"depends_on": ["face"]},
        },
        {
            "left_pupil": {"depends_on": ["left_white"]},
            "right_pupil": {"depends_on": ["right_white"]},
            "left_upper_lid": {"depends_on": ["left_white"]},
            "right_upper_lid": {"depends_on": ["right_white"]},
        },
        {
            "hair_front": {"depends_on": ["face"]},
            "hair_side_left": {"depends_on": ["face"]},
            "hair_side_right": {"depends_on": ["face"]},
        },
    ]

    def __init__(self, gemini_api_key: str) -> None:
        self.client = genai.Client(api_key=gemini_api_key)
        self.async_client = self.client.aio
        self.model = CURRENT_MODEL
        print(f"[PartsGenerator] 使用モデル: {self.model}")

    async def generate_all_parts(
        self,
        base_image_b64: str,
        masks: dict[str, str],
        semaphore_size: int = 4,
    ) -> dict[str, str | None]:
        semaphore = asyncio.Semaphore(semaphore_size)
        completed: dict[str, str | None] = {}

        for layer_idx, layer in enumerate(self.GENERATION_LAYERS):
            print(
                f"[PartsGenerator] LAYER {layer_idx} 生成開始: "
                f"{list(layer.keys())}"
            )

            layer_tasks = {
                part_name: self._generate_single_part(
                    semaphore=semaphore,
                    base_image_b64=base_image_b64,
                    mask_b64=masks.get(part_name),
                    part_name=part_name,
                    reference_parts={
                        dep: completed[dep]
                        for dep in config["depends_on"]
                        if dep in completed
                    },
                )
                for part_name, config in layer.items()
            }

            results = await asyncio.gather(
                *layer_tasks.values(), return_exceptions=True
            )

            for part_name, result in zip(layer_tasks.keys(), results):
                if isinstance(result, Exception):
                    print(f"[PartsGenerator] {part_name} 生成失敗: {result}")
                    completed[part_name] = None
                else:
                    completed[part_name] = result
                    print(f"[PartsGenerator] {part_name} 完了")

        return completed

    async def regenerate_part(
        self,
        base_image_b64: str,
        part_name: str,
        mask_b64: str | None = None,
        reference_parts: dict[str, str | None] | None = None,
    ) -> str:
        """単一パーツを再生成する（公開メソッド）"""
        semaphore = asyncio.Semaphore(1)
        return await self._generate_single_part(
            semaphore=semaphore,
            base_image_b64=base_image_b64,
            mask_b64=mask_b64,
            part_name=part_name,
            reference_parts=reference_parts or {},
        )

    async def _generate_single_part(
        self,
        semaphore: asyncio.Semaphore,
        base_image_b64: str,
        mask_b64: str | None,
        part_name: str,
        reference_parts: dict[str, str | None] | None = None,
    ) -> str:
        async with semaphore:
            part_prompt = PART_PROMPTS[part_name]
            base_bytes = base64.b64decode(base_image_b64)

            ref_note = ""
            if reference_parts:
                ref_names = [
                    n for n, v in reference_parts.items() if v is not None
                ]
                if ref_names:
                    ref_note = (
                        f"\n\n参照情報: {', '.join(ref_names)} パーツの"
                        f"生成結果も添付します。"
                        f"これらのパーツとの境界・色を合わせてください。"
                    )

            full_prompt = (
                f"この画像のキャラクターを参照して、以下のパーツだけを生成して"
                f"ください。\n"
                f"【必須ルール】背景は必ず純粋なグリーン(#00FF00)で塗りつぶす"
                f"こと。白背景は使用禁止。グラデーション・影・テクスチャは不可。\n"
                f"キャラクターのデザイン（髪色・目の色・肌色・服装）を完全に維持"
                f"すること。\n\n"
                f"生成するパーツ: {part_prompt}"
                f"{ref_note}"
            )

            contents: list = [
                types.Part.from_bytes(data=base_bytes, mime_type="image/png")
            ]

            if reference_parts:
                for _ref_name, ref_b64 in reference_parts.items():
                    if ref_b64:
                        ref_bytes = base64.b64decode(ref_b64)
                        contents.append(
                            types.Part.from_bytes(
                                data=ref_bytes, mime_type="image/png"
                            )
                        )

            if mask_b64:
                mask_bytes = base64.b64decode(mask_b64)
                contents.append(
                    types.Part.from_bytes(
                        data=mask_bytes, mime_type="image/png"
                    )
                )
                full_prompt += "\n\n(白い部分が生成対象領域のマスクです)"

            contents.append(types.Part.from_text(text=full_prompt))

            raw_b64 = await call_with_retry(
                lambda: self._call_gemini(contents)
            )

            return ensure_rgba(raw_b64, part_name)

    async def _call_gemini(self, contents: list) -> str:
        response = await self.async_client.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"]
            ),
        )
        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                return base64.b64encode(part.inline_data.data).decode()
        raise RuntimeError("Geminiが画像を返しませんでした")
