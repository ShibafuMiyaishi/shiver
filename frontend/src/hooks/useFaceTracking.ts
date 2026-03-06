import { useEffect, useRef, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { mapLandmarksToParams, getDefaultParams } from "../utils/faceMapper";
import { createIdleState, updateIdle } from "../utils/idleAnimator";
import { AvatarParameters, EmotionType } from "../types/avatar";
import { AvatarRenderer } from "../utils/pixiRenderer";

export function useFaceTracking(
  renderer: AvatarRenderer | null,
  onError: (msg: string) => void,
) {
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const idleStateRef = useRef(createIdleState());
  const lastFrameRef = useRef(performance.now());
  const emotionRef = useRef<EmotionType>("neutral");
  const winkRef = useRef({ left: false, right: false });
  const frameCountRef = useRef(0);
  const cachedParamsRef = useRef<AvatarParameters>(getDefaultParams());

  const setEmotion = useCallback((emotion: EmotionType) => {
    emotionRef.current = emotion;
  }, []);

  const setWink = useCallback((w: { left: boolean; right: boolean }) => {
    winkRef.current = w;
  }, []);

  const detectLoop = useCallback(() => {
    if (!renderer) {
      animFrameRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    const now = performance.now();
    const deltaMs = now - lastFrameRef.current;
    lastFrameRef.current = now;

    // A. 顔追跡パラメータ取得（2フレームに1回検出、描画は毎フレーム）
    frameCountRef.current++;
    let facialParams: AvatarParameters;
    const shouldDetect = frameCountRef.current % 2 === 0;
    if (shouldDetect && landmarkerRef.current && videoRef.current?.readyState === 4) {
      try {
        const results = landmarkerRef.current.detectForVideo(
          videoRef.current,
          now,
        );
        if (results.faceLandmarks.length > 0) {
          cachedParamsRef.current = mapLandmarksToParams(
            results.faceLandmarks[0],
            results.faceBlendshapes?.[0]?.categories ?? [],
          );
        }
      } catch {
        // 検出失敗は無視
      }
    }
    facialParams = cachedParamsRef.current;

    // B. アイドルアニメーション更新
    const { state: newIdleState, output: idle } = updateIdle(
      idleStateRef.current,
      now,
      deltaMs,
    );
    idleStateRef.current = newIdleState;

    // C. 感情・ウィンクの合成
    let finalBlinkL = facialParams.blink_left * idle.autoBlinkValue;
    let finalBlinkR = facialParams.blink_right * idle.autoBlinkValue;
    if (winkRef.current.left) finalBlinkL = 0.0;
    if (winkRef.current.right) finalBlinkR = 0.0;

    // D. 最終パラメータ構築
    const finalParams: AvatarParameters = {
      ...facialParams,
      blink_left: finalBlinkL,
      blink_right: finalBlinkR,
      breath_offset: idle.breathOffsetY,
      auto_blink: 1.0,
      emotion: emotionRef.current,
    };

    // E. レンダラー更新
    renderer.updateParameters(finalParams);

    animFrameRef.current = requestAnimationFrame(detectLoop);
  }, [renderer]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
        );
        if (cancelled) return;
        landmarkerRef.current = await FaceLandmarker.createFromOptions(
          filesetResolver,
          {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
          },
        );
      } catch {
        onError(
          "MediaPipeの初期化に失敗しました。ネットワーク接続を確認してください。",
        );
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
        if (cancelled) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        onError(
          "カメラへのアクセスが拒否されました。ブラウザの設定でカメラを許可してください。",
        );
      }

      if (!cancelled) {
        animFrameRef.current = requestAnimationFrame(detectLoop);
      }
    };

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop());
      }
    };
  }, [detectLoop, onError]);

  return { videoRef, setEmotion, setWink };
}
