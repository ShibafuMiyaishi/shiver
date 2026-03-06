import { AvatarPart, AvatarPartId } from "../types/avatar";
import { PART_CONFIG } from "./partConfig";
import { TEST_PARTS } from "./testParts";

/**
 * APIレスポンスのbase64パーツ画像をAvatarPart[]に変換する。
 * 位置情報はTEST_PARTSの定義を流用（Phase 3で自動推定に置き換え予定）。
 */
export function buildPartsFromB64(
  partsB64: Record<string, string | null>,
): AvatarPart[] {
  const result: AvatarPart[] = [];

  for (const [partId, b64] of Object.entries(partsB64)) {
    if (!b64) continue;
    if (!(partId in PART_CONFIG)) continue;

    const testPart = TEST_PARTS.find(p => p.id === partId);
    if (!testPart) continue;

    const config = PART_CONFIG[partId as AvatarPartId];
    result.push({
      ...testPart,
      imageUrl: `data:image/png;base64,${b64}`,
      ...config,
    });
  }

  // zIndex順にソート
  result.sort((a, b) => a.zIndex - b.zIndex);
  return result;
}
