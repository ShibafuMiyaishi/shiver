import { useState, useCallback } from "react";
import AvatarCanvas from "./components/AvatarCanvas";
import CameraCapture from "./components/CameraCapture";
import ErrorToast from "./components/ErrorToast";
import ExpressionPanel from "./components/ExpressionPanel";
import PromptInput from "./components/PromptInput";
import { useFaceTracking } from "./hooks/useFaceTracking";
import { useKeyBindings } from "./hooks/useKeyBindings";
import { AvatarRenderer } from "./utils/pixiRenderer";
import { EmotionType } from "./types/avatar";

export default function App() {
  const [renderer, setRenderer] = useState<AvatarRenderer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  const { videoRef, setEmotion, setWink } = useFaceTracking(renderer, handleError);

  useKeyBindings(
    useCallback((emotion: EmotionType, _intensity: number) => {
      setEmotion(emotion);
    }, [setEmotion]),
    useCallback((wink: { left: boolean; right: boolean }) => {
      setWink(wink);
    }, [setWink]),
  );

  const handleGenerate = useCallback(async (prompt: string) => {
    setIsGenerating(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${apiBase}/api/v1/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, num_images: 4 }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `生成に失敗しました (${res.status})`);
      }
      const data = await res.json();
      console.log("生成完了:", data.backend_used, `${data.images.length}枚`);
      // TODO: 4枚選択UIに渡す
    } catch (e) {
      handleError(e instanceof Error ? e.message : "画像生成中にエラーが発生しました");
    } finally {
      setIsGenerating(false);
    }
  }, [handleError]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold text-gray-200">shiver</h1>
      <p className="text-sm text-gray-400">
        AI自動生成VTuberアバターシステム
      </p>

      <PromptInput onGenerate={handleGenerate} isLoading={isGenerating} />

      <AvatarCanvas onRendererReady={setRenderer} />

      <CameraCapture ref={videoRef} />

      <ExpressionPanel />

      <div className="text-xs text-gray-500 text-center space-y-1">
        <p>カメラで顔追跡中 / 顔未検出時は自動まばたき+呼吸が動作</p>
      </div>

      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
