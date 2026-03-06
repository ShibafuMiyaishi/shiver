import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let cachedLandmarker: FaceLandmarker | null = null;

async function getLandmarker(): Promise<FaceLandmarker> {
  if (cachedLandmarker) return cachedLandmarker;

  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
  );
  cachedLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "IMAGE",
    numFaces: 1,
    outputFaceBlendshapes: false,
  });
  return cachedLandmarker;
}

/**
 * Base64画像からMediaPipe FaceLandmarkerでランドマークを検出する。
 * 正規化座標 {x, y, z} の配列を返す。顔未検出の場合は空配列。
 */
export async function detectLandmarksFromB64(
  imageB64: string,
): Promise<{ x: number; y: number; z: number }[]> {
  const landmarker = await getLandmarker();

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = `data:image/png;base64,${imageB64}`;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const results = landmarker.detect(canvas);
  if (results.faceLandmarks.length === 0) return [];

  return results.faceLandmarks[0].map(lm => ({
    x: lm.x,
    y: lm.y,
    z: lm.z,
  }));
}
