import { useState, useCallback, useRef } from "react";
import AvatarCanvas from "./components/AvatarCanvas";
import CameraCapture from "./components/CameraCapture";
import ErrorToast from "./components/ErrorToast";
import ExpressionPanel from "./components/ExpressionPanel";
import ImageSelector from "./components/ImageSelector";
import KeyBindingEditor from "./components/KeyBindingEditor";
import PartEditor from "./components/PartEditor";
import ProjectControls from "./components/ProjectControls";
import PromptInput from "./components/PromptInput";
import { useFaceTracking } from "./hooks/useFaceTracking";
import { useKeyBindings } from "./hooks/useKeyBindings";
import { AvatarRenderer } from "./utils/pixiRenderer";
import { detectLandmarksFromB64 } from "./utils/detectLandmarks";
import { buildPartsWithPositions } from "./utils/partPositioner";
import { saveProject, loadProject } from "./utils/projectManager";
import {
  AvatarPart,
  EmotionType,
  KeyBinding,
  DEFAULT_KEY_BINDINGS,
} from "./types/avatar";

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
  const [partStatuses, setPartStatuses] = useState<PartStatus[]>([]);
  const [regeneratingPart, setRegeneratingPart] = useState<string | null>(null);
  const [keyBindings, setKeyBindings] = useState<KeyBinding[]>(DEFAULT_KEY_BINDINGS);
  const [showKeyEditor, setShowKeyEditor] = useState(false);

  // live状態のパーツ（保存用）
  const livePartsRef = useRef<AvatarPart[]>([]);
  // ランドマーク（位置自動推定用）
  const landmarksRef = useRef<{ x: number; y: number }[]>([]);

  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

  const handleError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  const { videoRef, setEmotion, setWink } = useFaceTracking(renderer, handleError);

  useKeyBindings(
    keyBindings,
    useCallback((emotion: EmotionType, _intensity: number) => {
      setEmotion(emotion);
    }, [setEmotion]),
    useCallback((wink: { left: boolean; right: boolean }) => {
      setWink(wink);
    }, [setWink]),
  );

  // ── 画像生成 ──
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

  // ── 画像選択 → セグメンテーション → パーツ生成 ──
  const handleImageSelect = useCallback(async (index: number) => {
    const imageB64 = generatedImages[index];
    setSelectedImageB64(imageB64);
    setPhase("segmenting");

    try {
      // Step 1: 顔ランドマーク検出
      const landmarks = await detectLandmarksFromB64(imageB64);
      if (landmarks.length === 0) {
        throw new Error("ベース画像から顔を検出できませんでした。別の画像を選択してください。");
      }
      landmarksRef.current = landmarks;

      // Step 2: ベース画像の実サイズを取得（Gemini生成画像は512×768とは限らない）
      const imgDims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("画像サイズの取得に失敗しました"));
        img.src = `data:image/png;base64,${imageB64}`;
      });

      // Step 3: SAM2セグメンテーション
      const segRes = await fetch(`${apiBase}/api/v1/segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_b64: imageB64,
          landmarks: landmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z })),
          img_width: imgDims.width,
          img_height: imgDims.height,
        }),
      });
      if (!segRes.ok) throw new Error("セグメンテーションに失敗しました");
      const segData = await segRes.json();
      const masks: Record<string, string> = {};
      for (const [partId, result] of Object.entries(segData.results)) {
        const r = result as { mask_b64?: string; error?: string };
        if (r.mask_b64) masks[partId] = r.mask_b64;
      }

      // Step 4: パーツ生成
      const partsRes = await fetch(`${apiBase}/api/v1/generate-parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_image_b64: imageB64, masks }),
      });
      if (!partsRes.ok) throw new Error("パーツ生成に失敗しました");
      const partsData = await partsRes.json();

      const statuses: PartStatus[] = Object.entries(partsData.parts).map(
        ([partId, b64]) => ({
          name: partId,
          partId,
          hasImage: b64 !== null,
          imageB64: (b64 as string) || undefined,
        })
      );
      setPartStatuses(statuses);
      setPhase("editing");
    } catch (e) {
      handleError(e instanceof Error ? e.message : "パーツ生成中にエラーが発生しました");
      setPhase("idle");
    }
  }, [apiBase, generatedImages, handleError]);

  // ── 単一パーツ再生成 ──
  const handleRegeneratePart = useCallback(async (partId: string) => {
    if (!selectedImageB64) return;
    setRegeneratingPart(partId);
    try {
      const res = await fetch(`${apiBase}/api/v1/regenerate-part`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_image_b64: selectedImageB64, part_name: partId }),
      });
      if (!res.ok) throw new Error("再生成に失敗しました");
      const data = await res.json();
      if (data.image_b64) {
        setPartStatuses(prev => prev.map(p =>
          p.partId === partId
            ? { ...p, hasImage: true, imageB64: data.image_b64 }
            : p
        ));
      }
    } catch (e) {
      handleError(e instanceof Error ? e.message : "パーツ再生成に失敗しました");
    } finally {
      setRegeneratingPart(null);
    }
  }, [apiBase, selectedImageB64, handleError]);

  // ── パーツ確定 → レンダラー読み込み ──
  const handleConfirmParts = useCallback(() => {
    if (!renderer) return;
    const partsB64: Record<string, string | null> = {};
    for (const p of partStatuses) {
      partsB64[p.partId] = p.imageB64 ?? null;
    }
    // ランドマークがあれば位置自動推定、なければフォールバック
    const avatarParts = buildPartsWithPositions(
      partsB64,
      landmarksRef.current.length > 0 ? landmarksRef.current : undefined,
    );
    if (avatarParts.length === 0) {
      handleError("有効なパーツがありません。再生成してください。");
      return;
    }
    renderer.loadParts(avatarParts);
    livePartsRef.current = avatarParts;
    setPhase("live");
  }, [renderer, partStatuses, handleError]);

  // ── プロジェクト保存 ──
  const handleSave = useCallback(() => {
    if (livePartsRef.current.length === 0) return;
    const name = prompt("プロジェクト名を入力してください:", "my-avatar") || "my-avatar";
    saveProject(name, livePartsRef.current, selectedImageB64, keyBindings);
  }, [selectedImageB64, keyBindings]);

  // ── プロジェクト読み込み ──
  const handleLoad = useCallback(async (file: File) => {
    try {
      const project = await loadProject(file);
      if (!renderer) {
        handleError("レンダラーが初期化されていません。");
        return;
      }
      renderer.loadParts(project.parts);
      livePartsRef.current = project.parts;
      if (project.keyBindings) {
        setKeyBindings(project.keyBindings);
      }
      setPhase("live");
    } catch (e) {
      handleError(e instanceof Error ? e.message : "プロジェクト読み込みに失敗しました");
    }
  }, [renderer, handleError]);

  const isLoading = phase === "generating" || phase === "segmenting";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-200">shiver</h1>
        <ProjectControls
          onSave={handleSave}
          onLoad={handleLoad}
          canSave={phase === "live" && livePartsRef.current.length > 0}
        />
      </div>
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
          parts={partStatuses}
          onRegenerate={handleRegeneratePart}
          onConfirm={handleConfirmParts}
          isRegenerating={regeneratingPart}
        />
      )}

      <ExpressionPanel
        bindings={keyBindings}
        onOpenEditor={() => setShowKeyEditor(true)}
      />

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

      {showKeyEditor && (
        <KeyBindingEditor
          bindings={keyBindings}
          onChange={setKeyBindings}
          onClose={() => setShowKeyEditor(false)}
        />
      )}

      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
