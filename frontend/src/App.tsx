import { useState, useCallback } from "react";
import AvatarCanvas from "./components/AvatarCanvas";
import CameraCapture from "./components/CameraCapture";
import ErrorToast from "./components/ErrorToast";
import ExpressionPanel from "./components/ExpressionPanel";
import ImageSelector from "./components/ImageSelector";
import PartEditor from "./components/PartEditor";
import PromptInput from "./components/PromptInput";
import { useFaceTracking } from "./hooks/useFaceTracking";
import { useKeyBindings } from "./hooks/useKeyBindings";
import { AvatarRenderer } from "./utils/pixiRenderer";
import { EmotionType } from "./types/avatar";

type AppPhase = "idle" | "generating" | "selecting" | "segmenting" | "editing" | "live";

interface PartStatus {
  name: string;
  partId: string;
  hasImage: boolean;
  imageB64?: string;
}

export default function App() {
  const [renderer, setRenderer] = useState<AvatarRenderer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<AppPhase>("idle");
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImageB64, setSelectedImageB64] = useState<string | null>(null);
  const [parts, setParts] = useState<PartStatus[]>([]);
  const [regeneratingPart, setRegeneratingPart] = useState<string | null>(null);

  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

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
    setPhase("generating");
    try {
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
      setGeneratedImages(data.images);
      setPhase("selecting");
    } catch (e) {
      handleError(e instanceof Error ? e.message : "画像生成中にエラーが発生しました");
      setPhase("idle");
    }
  }, [apiBase, handleError]);

  const handleImageSelect = useCallback(async (index: number) => {
    const imageB64 = generatedImages[index];
    setSelectedImageB64(imageB64);
    setPhase("segmenting");

    try {
      // Step 1: SAM2セグメンテーション
      const segRes = await fetch(`${apiBase}/api/v1/segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_b64: imageB64,
          landmarks: [],
          img_width: 512,
          img_height: 768,
        }),
      });
      if (!segRes.ok) {
        throw new Error("セグメンテーションに失敗しました");
      }
      const segData = await segRes.json();
      const masks: Record<string, string> = {};
      for (const [partId, result] of Object.entries(segData.results)) {
        const r = result as { mask_b64?: string; error?: string };
        if (r.mask_b64) masks[partId] = r.mask_b64;
      }

      // Step 2: パーツ生成
      const partsRes = await fetch(`${apiBase}/api/v1/generate-parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_image_b64: imageB64,
          masks,
        }),
      });
      if (!partsRes.ok) {
        throw new Error("パーツ生成に失敗しました");
      }
      const partsData = await partsRes.json();

      const partStatuses: PartStatus[] = Object.entries(partsData.parts).map(
        ([partId, b64]) => ({
          name: partId,
          partId,
          hasImage: b64 !== null,
          imageB64: (b64 as string) || undefined,
        })
      );
      setParts(partStatuses);
      setPhase("editing");
    } catch (e) {
      handleError(e instanceof Error ? e.message : "パーツ生成中にエラーが発生しました");
      setPhase("idle");
    }
  }, [apiBase, generatedImages, handleError]);

  const handleRegeneratePart = useCallback(async (partId: string) => {
    if (!selectedImageB64) return;
    setRegeneratingPart(partId);
    try {
      const res = await fetch(`${apiBase}/api/v1/generate-parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_image_b64: selectedImageB64,
          masks: {},
        }),
      });
      if (!res.ok) throw new Error("再生成に失敗しました");
      const data = await res.json();
      if (data.parts[partId]) {
        setParts(prev => prev.map(p =>
          p.partId === partId
            ? { ...p, hasImage: true, imageB64: data.parts[partId] }
            : p
        ));
      }
    } catch (e) {
      handleError(e instanceof Error ? e.message : "パーツ再生成に失敗しました");
    } finally {
      setRegeneratingPart(null);
    }
  }, [apiBase, selectedImageB64, handleError]);

  const handleConfirmParts = useCallback(() => {
    // TODO: 生成パーツをAvatarRendererに読み込む
    setPhase("live");
  }, []);

  const isLoading = phase === "generating" || phase === "segmenting";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold text-gray-200">shiver</h1>
      <p className="text-sm text-gray-400">
        AI自動生成VTuberアバターシステム
      </p>

      <PromptInput onGenerate={handleGenerate} isLoading={isLoading} />

      {phase === "segmenting" && (
        <div className="text-sm text-blue-400 animate-pulse">
          パーツを生成中...（数分かかる場合があります）
        </div>
      )}

      <AvatarCanvas onRendererReady={setRenderer} />

      <CameraCapture ref={videoRef} />

      {phase === "editing" && (
        <PartEditor
          parts={parts}
          onRegenerate={handleRegeneratePart}
          onConfirm={handleConfirmParts}
          isRegenerating={regeneratingPart}
        />
      )}

      <ExpressionPanel />

      <div className="text-xs text-gray-500 text-center space-y-1">
        <p>カメラで顔追跡中 / 顔未検出時は自動まばたき+呼吸が動作</p>
      </div>

      {phase === "selecting" && (
        <ImageSelector
          images={generatedImages}
          onSelect={handleImageSelect}
          onCancel={() => { setPhase("idle"); setGeneratedImages([]); }}
        />
      )}

      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
