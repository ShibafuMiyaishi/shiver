export type AvatarPartId =
  | "hair_back"
  | "face"
  | "nose"
  | "left_white"   | "right_white"
  | "left_pupil"   | "right_pupil"
  | "left_upper_lid" | "right_upper_lid"
  | "left_brow"    | "right_brow"
  | "mouth"
  | "blush_left"   | "blush_right"
  | "hair_front"
  | "hair_side_left" | "hair_side_right";

export interface AvatarPart {
  id: AvatarPartId;
  name: string;
  imageUrl: string;
  anchorX: number;
  anchorY: number;
  baseX: number;
  baseY: number;
  baseWidth: number;
  baseHeight: number;
  zIndex: number;
  parallax: number;
  hasPhysics: boolean;
  physicsConfig?: PhysicsConfig;
}

export interface PhysicsConfig {
  stiffness: number;
  damping: number;
  gravity: number;
  maxAngle: number;
}

export interface AvatarParameters {
  blink_left: number;
  blink_right: number;
  pupil_x: number;
  pupil_y: number;
  mouth_open: number;
  mouth_form: number;    // -1.0(すぼめ/u,o) ~ 1.0(横広/i,e) リップシンク用
  brow_left: number;
  brow_right: number;
  head_yaw: number;
  head_pitch: number;
  head_roll: number;
  emotion: EmotionType;
  blush_intensity: number;
  breath_offset: number;
  auto_blink: number;
}

export type EmotionType =
  | "neutral"
  | "happy"
  | "blush"
  | "sad"
  | "angry"
  | "surprised";

export interface KeyBinding {
  key: string;
  emotion: EmotionType;
  label: string;
  durationMs: number;
}

export const DEFAULT_KEY_BINDINGS: KeyBinding[] = [
  { key: "1", emotion: "blush",     label: "照れ",       durationMs: 3000 },
  { key: "2", emotion: "sad",       label: "泣き顔",     durationMs: 0    },
  { key: "3", emotion: "angry",     label: "怒り",       durationMs: 0    },
  { key: "4", emotion: "surprised", label: "サプライズ", durationMs: 2000 },
  { key: "5", emotion: "happy",     label: "笑顔",       durationMs: 0    },
];

export interface AvatarProject {
  id: string;
  name: string;
  sourceImageUrl: string;
  parts: AvatarPart[];
  keyBindings: KeyBinding[];
  createdAt: string;
}
