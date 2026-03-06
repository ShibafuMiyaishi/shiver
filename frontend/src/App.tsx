import { useState, useCallback } from "react";
import AvatarCanvas from "./components/AvatarCanvas";
import CameraCapture from "./components/CameraCapture";
import ErrorToast from "./components/ErrorToast";
import { useFaceTracking } from "./hooks/useFaceTracking";
import { AvatarRenderer } from "./utils/pixiRenderer";

export default function App() {
  const [renderer, setRenderer] = useState<AvatarRenderer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  const { videoRef } = useFaceTracking(renderer, handleError);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold text-gray-200">shiver</h1>
      <p className="text-sm text-gray-400">
        AI自動生成VTuberアバターシステム
      </p>

      <AvatarCanvas onRendererReady={setRenderer} />

      <CameraCapture ref={videoRef} />

      <div className="text-xs text-gray-500 text-center space-y-1">
        <p>カメラで顔追跡中 / 顔未検出時は自動まばたき+呼吸が動作</p>
      </div>

      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
