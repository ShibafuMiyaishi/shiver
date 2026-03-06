import { AvatarPart, AvatarPartId } from "../types/avatar";
import { PART_CONFIG } from "./partConfig";

/**
 * ランドマーク→パーツ位置自動推定（Phase 3: 3.1）
 *
 * ベース画像のMediaPipeランドマーク(正規化座標)から
 * 各パーツの配置座標・サイズ・アンカーポイントを自動計算する。
 */

// バックエンドの LANDMARK_TO_PARTS と同一のマッピング
const LANDMARK_INDICES: Record<AvatarPartId, number[]> = {
  face: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288],
  nose: [1, 2, 5, 4, 19, 94],
  mouth: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
  left_white: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  right_white: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
  left_pupil: [468, 469, 470, 471, 472],
  right_pupil: [473, 474, 475, 476, 477],
  left_upper_lid: [159, 160, 161, 246, 33, 130, 7, 163],
  right_upper_lid: [386, 385, 384, 398, 362, 359, 382, 381],
  left_brow: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  right_brow: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
  blush_left: [116, 117, 118, 119, 100, 47, 114, 188],
  blush_right: [345, 346, 347, 348, 329, 277, 343, 412],
  hair_back: [10, 338, 297, 332, 284, 251],
  hair_front: [10, 338, 109, 67, 103, 54],
  hair_side_left: [234, 93, 132, 58, 172],
  hair_side_right: [454, 323, 361, 288, 397],
};

const PART_ANCHORS: Record<AvatarPartId, { x: number; y: number }> = {
  hair_back: { x: 0.5, y: 0.3 },
  face: { x: 0.5, y: 0.4 },
  left_white: { x: 0.5, y: 0.5 },
  right_white: { x: 0.5, y: 0.5 },
  left_pupil: { x: 0.5, y: 0.5 },
  right_pupil: { x: 0.5, y: 0.5 },
  left_upper_lid: { x: 0.5, y: 1.0 },
  right_upper_lid: { x: 0.5, y: 1.0 },
  left_brow: { x: 0.5, y: 0.5 },
  right_brow: { x: 0.5, y: 0.5 },
  nose: { x: 0.5, y: 0.5 },
  mouth: { x: 0.5, y: 0.5 },
  blush_left: { x: 0.5, y: 0.5 },
  blush_right: { x: 0.5, y: 0.5 },
  hair_front: { x: 0.5, y: 0.8 },
  hair_side_left: { x: 0.8, y: 0.2 },
  hair_side_right: { x: 0.2, y: 0.2 },
};

const PART_NAMES: Record<AvatarPartId, string> = {
  hair_back: "後ろ髪",
  face: "顔",
  left_white: "左白目",
  right_white: "右白目",
  left_pupil: "左瞳",
  right_pupil: "右瞳",
  left_upper_lid: "左上まぶた",
  right_upper_lid: "右上まぶた",
  left_brow: "左眉",
  right_brow: "右眉",
  nose: "鼻",
  mouth: "口",
  blush_left: "左頬染め",
  blush_right: "右頬染め",
  hair_front: "前髪",
  hair_side_left: "左横髪",
  hair_side_right: "右横髪",
};

// BBox パディング倍率（パーツ種別に応じて調整）
const PART_PADDING: Record<AvatarPartId, number> = {
  hair_back: 1.5,
  face: 1.15,
  left_white: 1.3,
  right_white: 1.3,
  left_pupil: 1.4,
  right_pupil: 1.4,
  left_upper_lid: 1.3,
  right_upper_lid: 1.3,
  left_brow: 1.3,
  right_brow: 1.3,
  nose: 1.4,
  mouth: 1.3,
  blush_left: 1.5,
  blush_right: 1.5,
  hair_front: 1.4,
  hair_side_left: 1.4,
  hair_side_right: 1.4,
};

// 最小パーツサイズ（ピクセル）
const MIN_PART_SIZE = 10;

export interface PartPosition {
  baseX: number;
  baseY: number;
  baseWidth: number;
  baseHeight: number;
  anchorX: number;
  anchorY: number;
}

/**
 * ランドマーク座標から全パーツの配置位置を自動計算する。
 * landmarks は MediaPipe の正規化座標 (0.0~1.0)。
 */
export function computePartPositions(
  landmarks: { x: number; y: number }[],
  imgWidth: number,
  imgHeight: number,
): Partial<Record<AvatarPartId, PartPosition>> {
  const result: Partial<Record<AvatarPartId, PartPosition>> = {};

  for (const [partId, indices] of Object.entries(LANDMARK_INDICES)) {
    const pid = partId as AvatarPartId;
    const validPoints = indices
      .filter(i => i < landmarks.length)
      .map(i => ({
        px: landmarks[i].x * imgWidth,
        py: landmarks[i].y * imgHeight,
      }));

    if (validPoints.length === 0) continue;

    const xs = validPoints.map(p => p.px);
    const ys = validPoints.map(p => p.py);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const rawW = maxX - minX;
    const rawH = maxY - minY;
    const padding = PART_PADDING[pid];
    const w = Math.max(rawW * padding, MIN_PART_SIZE);
    const h = Math.max(rawH * padding, MIN_PART_SIZE);

    const anchor = PART_ANCHORS[pid];

    // アンカーポイントの位置 = BBox内でのアンカー割合
    result[pid] = {
      baseX: minX + anchor.x * rawW,
      baseY: minY + anchor.y * rawH,
      baseWidth: w,
      baseHeight: h,
      anchorX: anchor.x,
      anchorY: anchor.y,
    };
  }

  return result;
}

/**
 * base64パーツ画像 + ランドマーク → AvatarPart[] を構築する。
 * ランドマークがない場合はTEST_PARTS位置にフォールバック。
 */
export function buildPartsWithPositions(
  partsB64: Record<string, string | null>,
  landmarks?: { x: number; y: number }[],
  imgWidth = 512,
  imgHeight = 768,
): AvatarPart[] {
  const positions = landmarks
    ? computePartPositions(landmarks, imgWidth, imgHeight)
    : null;

  const result: AvatarPart[] = [];

  for (const [partId, b64] of Object.entries(partsB64)) {
    if (!b64) continue;
    const pid = partId as AvatarPartId;
    if (!(pid in PART_CONFIG)) continue;

    const config = PART_CONFIG[pid];
    const pos = positions?.[pid];
    const anchor = PART_ANCHORS[pid];

    if (pos) {
      result.push({
        id: pid,
        name: PART_NAMES[pid] || pid,
        imageUrl: `data:image/png;base64,${b64}`,
        anchorX: pos.anchorX,
        anchorY: pos.anchorY,
        baseX: pos.baseX,
        baseY: pos.baseY,
        baseWidth: pos.baseWidth,
        baseHeight: pos.baseHeight,
        ...config,
      });
    } else {
      // フォールバック: 画面中央付近にデフォルト配置
      result.push({
        id: pid,
        name: PART_NAMES[pid] || pid,
        imageUrl: `data:image/png;base64,${b64}`,
        anchorX: anchor.x,
        anchorY: anchor.y,
        baseX: 256,
        baseY: 350,
        baseWidth: 100,
        baseHeight: 100,
        ...config,
      });
    }
  }

  result.sort((a, b) => a.zIndex - b.zIndex);
  return result;
}
