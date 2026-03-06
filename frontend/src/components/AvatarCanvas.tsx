import { useRef, useEffect, useState, useCallback } from "react";
import { AvatarRenderer } from "../utils/pixiRenderer";
import { TEST_PARTS } from "../utils/testParts";

interface AvatarCanvasProps {
  onRendererReady: (renderer: AvatarRenderer) => void;
}

export default function AvatarCanvas({ onRendererReady }: AvatarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  const initRenderer = useCallback(() => {
    if (!canvasRef.current || ready) return;
    try {
      const renderer = new AvatarRenderer(canvasRef.current);
      renderer.loadParts(TEST_PARTS);
      onRendererReady(renderer);
      setReady(true);
    } catch (e) {
      console.error("PixiJS初期化失敗:", e);
    }
  }, [onRendererReady, ready]);

  useEffect(() => {
    initRenderer();
  }, [initRenderer]);

  return (
    <div className="flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={512}
        height={768}
        className="border border-gray-700 rounded-lg"
      />
    </div>
  );
}
