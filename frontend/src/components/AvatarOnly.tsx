import { useState, useCallback, useRef, useEffect } from "react";
import { AvatarRenderer } from "../utils/pixiRenderer";
import { TEST_PARTS } from "../utils/testParts";
import { createIdleState, updateIdle } from "../utils/idleAnimator";
import { getDefaultParams } from "../utils/faceMapper";
import { AvatarParameters } from "../types/avatar";

/**
 * OBS Browser Source 用の最小構成ビュー。
 * UIなし・透過背景・アイドルアニメーション(まばたき+呼吸)のみ。
 *
 * OBS設定:
 *   URL: http://localhost:5173/avatar
 *   幅: 512 / 高さ: 768
 *   カスタムCSS: body { background-color: rgba(0,0,0,0) !important; margin: 0; }
 */
export default function AvatarOnly() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AvatarRenderer | null>(null);
  const idleRef = useRef(createIdleState());
  const lastRef = useRef(performance.now());
  const animRef = useRef(0);
  const [, setReady] = useState(false);

  const loop = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) {
      animRef.current = requestAnimationFrame(loop);
      return;
    }

    const now = performance.now();
    const deltaMs = now - lastRef.current;
    lastRef.current = now;

    const { state, output } = updateIdle(idleRef.current, now, deltaMs);
    idleRef.current = state;

    const params: AvatarParameters = {
      ...getDefaultParams(),
      blink_left: output.autoBlinkValue,
      blink_right: output.autoBlinkValue,
      breath_offset: output.breathOffsetY,
      auto_blink: 1.0,
    };

    renderer.updateParameters(params);
    animRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      const renderer = new AvatarRenderer(canvasRef.current);
      renderer.loadParts(TEST_PARTS);
      rendererRef.current = renderer;
      setReady(true);
      animRef.current = requestAnimationFrame(loop);
    } catch (e) {
      console.error("AvatarOnly PixiJS初期化失敗:", e);
    }

    return () => {
      cancelAnimationFrame(animRef.current);
      rendererRef.current?.destroy();
    };
  }, [loop]);

  return (
    <canvas
      ref={canvasRef}
      width={512}
      height={768}
      style={{ display: "block" }}
    />
  );
}
