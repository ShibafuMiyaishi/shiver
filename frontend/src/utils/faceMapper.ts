import { NormalizedLandmark, Category } from "@mediapipe/tasks-vision";
import { AvatarParameters } from "../types/avatar";

export class AdaptiveThreshold {
  private buffer: number[] = [];
  private readonly windowSize: number;
  private mean: number;
  private std: number;

  constructor(windowSize = 30, initialMean = 0.28) {
    this.windowSize = windowSize;
    this.mean = initialMean;
    this.std = 0.05;
  }

  update(value: number): void {
    this.buffer.push(value);
    if (this.buffer.length > this.windowSize) this.buffer.shift();
    if (this.buffer.length >= 5) {
      this.mean =
        this.buffer.reduce((a, b) => a + b) / this.buffer.length;
      const variance =
        this.buffer.reduce((a, b) => a + (b - this.mean) ** 2, 0) /
        this.buffer.length;
      this.std = Math.sqrt(variance);
    }
  }

  normalize(value: number): number {
    const closed = this.mean - this.std * 0.8;
    const open = this.mean + this.std * 0.5;
    return Math.min(1.0, Math.max(0.0, (value - closed) / (open - closed)));
  }
}

const earLeftThreshold = new AdaptiveThreshold(30, 0.28);
const earRightThreshold = new AdaptiveThreshold(30, 0.28);
const marThreshold = new AdaptiveThreshold(30, 0.05);

function calcEAR(p: NormalizedLandmark[]): number {
  const v1 = Math.abs(p[1].y - p[5].y);
  const v2 = Math.abs(p[2].y - p[4].y);
  const h = Math.abs(p[0].x - p[3].x);
  return h === 0 ? 0.3 : (v1 + v2) / (2.0 * h);
}

function calcMAR(p: NormalizedLandmark[]): number {
  const v = Math.abs(p[2].y - p[6].y);
  const h = Math.abs(p[0].x - p[4].x);
  return h === 0 ? 0.0 : v / h;
}

function calcPupilXY(blendshapes: Category[]): { x: number; y: number } {
  const get = (name: string) =>
    blendshapes.find((b) => b.categoryName === name)?.score ?? 0;

  // v3.2修正: 正しいblendshape名を使用
  const lookLeft = get("eyeLookOutLeft");
  const lookRight = get("eyeLookInLeft");
  const lookUp = get("eyeLookUpLeft");
  const lookDown = get("eyeLookDownLeft");

  const x = Math.min(1.0, Math.max(-1.0, lookRight - lookLeft));
  const y = Math.min(1.0, Math.max(-1.0, lookDown - lookUp));

  return { x, y };
}

export function mapLandmarksToParams(
  landmarks: NormalizedLandmark[],
  blendshapes: Category[],
): AvatarParameters {
  // v3.2: iris含めて478ランドマーク
  if (landmarks.length < 478) {
    return getDefaultParams();
  }

  const leftEyePts = [33, 160, 158, 133, 153, 144].map((i) => landmarks[i]);
  const rightEyePts = [362, 385, 387, 263, 373, 380].map((i) => landmarks[i]);
  const earLeft = calcEAR(leftEyePts);
  const earRight = calcEAR(rightEyePts);
  earLeftThreshold.update(earLeft);
  earRightThreshold.update(earRight);

  const mouthPts = [61, 39, 0, 269, 291, 405, 17, 14].map(
    (i) => landmarks[i],
  );
  const mar = calcMAR(mouthPts);
  marThreshold.update(mar);

  // 口の横幅（リップシンク用）: 口角間の距離 / 顔幅で正規化
  const mouthWidth = Math.abs(landmarks[291].x - landmarks[61].x);
  const faceWidth = Math.abs(landmarks[454].x - landmarks[234].x);
  const mouthWidthRatio = faceWidth > 0 ? mouthWidth / faceWidth : 0.3;
  // 0.25〜0.45の範囲を -1〜1 に正規化
  const mouthForm = Math.min(1.0, Math.max(-1.0, (mouthWidthRatio - 0.35) * 10));

  const pupil = calcPupilXY(blendshapes);

  const browLeftY = landmarks[66].y;
  const browRightY = landmarks[296].y;
  const eyeLeftY = landmarks[159].y;
  const eyeRightY = landmarks[386].y;
  const browLeft = Math.min(
    1.0,
    Math.max(-1.0, (eyeLeftY - browLeftY - 0.06) * 8),
  );
  const browRight = Math.min(
    1.0,
    Math.max(-1.0, (eyeRightY - browRightY - 0.06) * 8),
  );

  const noseX = landmarks[1].x;
  const leftEarX = landmarks[454].x;
  const rightEarX = landmarks[234].x;
  const headYaw = Math.min(
    30,
    Math.max(-30, (noseX - (leftEarX + rightEarX) / 2) * 60),
  );

  const noseY = landmarks[1].y;
  const faceTopY = landmarks[10].y;
  const faceBotY = landmarks[152].y;
  const headPitch = Math.min(
    20,
    Math.max(-20, (noseY - (faceTopY + faceBotY) / 2) * 40),
  );

  const eyeLY = landmarks[159].y;
  const eyeRY = landmarks[386].y;
  const headRoll = Math.min(15, Math.max(-15, (eyeRY - eyeLY) * 120));

  return {
    blink_left: earLeftThreshold.normalize(earLeft),
    blink_right: earRightThreshold.normalize(earRight),
    pupil_x: pupil.x,
    pupil_y: pupil.y,
    mouth_open: marThreshold.normalize(mar),
    mouth_form: mouthForm,
    brow_left: browLeft,
    brow_right: browRight,
    head_yaw: headYaw,
    head_pitch: headPitch,
    head_roll: headRoll,
    emotion: "neutral",
    blush_intensity: 0.0,
    breath_offset: 0,
    auto_blink: 1.0,
  };
}

export function getDefaultParams(): AvatarParameters {
  return {
    blink_left: 1.0,
    blink_right: 1.0,
    pupil_x: 0,
    pupil_y: 0,
    mouth_open: 0.0,
    mouth_form: 0.0,
    brow_left: 0.0,
    brow_right: 0.0,
    head_yaw: 0.0,
    head_pitch: 0.0,
    head_roll: 0.0,
    emotion: "neutral",
    blush_intensity: 0.0,
    breath_offset: 0,
    auto_blink: 1.0,
  };
}
