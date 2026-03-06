import * as PIXI from "pixi.js";
import {
  AvatarPart,
  AvatarParameters,
  AvatarPartId,
} from "../types/avatar";
import {
  PhysicsState,
  createPhysicsState,
  updatePhysics,
} from "./physicsEngine";

interface SpriteEx extends PIXI.Sprite {
  baseX: number;
  baseY: number;
}

// v3.2: 瞳・眉は独自変形のため視差スクロールから除外
const PUPIL_BROW_PARTS: Set<AvatarPartId> = new Set([
  "left_pupil", "right_pupil",
  "left_brow", "right_brow",
]);

export class AvatarRenderer {
  private app: PIXI.Application;
  private sprites = new Map<AvatarPartId, SpriteEx>();
  private parts = new Map<AvatarPartId, AvatarPart>();
  private physics = new Map<AvatarPartId, PhysicsState>();
  private lastTime = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.app = new PIXI.Application({
      view: canvas,
      width: 512,
      height: 768,
      backgroundColor: 0x000000,
      backgroundAlpha: 0,
      antialias: false,
      resolution: 1,
      autoDensity: false,
      powerPreference: "high-performance",
    });
    this.app.stage.sortableChildren = true;
  }

  loadParts(parts: AvatarPart[]): void {
    this.app.stage.removeChildren();
    this.sprites.clear();
    this.parts.clear();
    this.physics.clear();

    parts.forEach((part) => {
      const sprite = PIXI.Sprite.from(part.imageUrl) as SpriteEx;
      sprite.anchor.set(part.anchorX, part.anchorY);
      sprite.x = part.baseX;
      sprite.y = part.baseY;
      sprite.width = part.baseWidth;
      sprite.height = part.baseHeight;
      sprite.zIndex = part.zIndex;
      sprite.baseX = part.baseX;
      sprite.baseY = part.baseY;

      this.app.stage.addChild(sprite);
      this.sprites.set(part.id, sprite);
      this.parts.set(part.id, part);

      if (part.hasPhysics) {
        this.physics.set(part.id, createPhysicsState());
      }
    });
  }

  updateParameters(params: AvatarParameters): void {
    const now = performance.now();
    const deltaTime = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const finalBlinkL = params.blink_left * params.auto_blink;
    const finalBlinkR = params.blink_right * params.auto_blink;

    // 上まぶた
    const lidL = this.sprites.get("left_upper_lid");
    const lidR = this.sprites.get("right_upper_lid");
    if (lidL) lidL.scale.y = Math.max(0.05, finalBlinkL);
    if (lidR) lidR.scale.y = Math.max(0.05, finalBlinkR);

    // 白目
    const whiteL = this.sprites.get("left_white");
    const whiteR = this.sprites.get("right_white");
    if (whiteL) whiteL.scale.y = Math.max(0.1, finalBlinkL * 0.9);
    if (whiteR) whiteR.scale.y = Math.max(0.1, finalBlinkR * 0.9);

    // 瞳: XY移動 + まばたきスケール
    const PUPIL_RANGE = 8;
    const pupilL = this.sprites.get("left_pupil");
    const pupilR = this.sprites.get("right_pupil");
    if (pupilL) {
      const base = this.parts.get("left_pupil")!;
      pupilL.x = base.baseX + params.pupil_x * PUPIL_RANGE;
      pupilL.y = base.baseY + params.pupil_y * PUPIL_RANGE;
      pupilL.scale.y = Math.max(0.05, finalBlinkL);
    }
    if (pupilR) {
      const base = this.parts.get("right_pupil")!;
      pupilR.x = base.baseX + params.pupil_x * PUPIL_RANGE;
      pupilR.y = base.baseY + params.pupil_y * PUPIL_RANGE;
      pupilR.scale.y = Math.max(0.05, finalBlinkR);
    }

    // サプライズ
    if (params.emotion === "surprised") {
      [lidL, lidR, whiteL, whiteR, pupilL, pupilR].forEach((s) => {
        if (s) s.scale.y = Math.min(1.2, s.scale.y + 0.2);
      });
    }

    // 口（リップシンク: mouth_open + mouth_form）
    const mouth = this.sprites.get("mouth");
    if (mouth) {
      mouth.scale.y =
        params.emotion === "happy"
          ? 0.5 + 0.3 * params.mouth_open
          : 0.6 + 0.6 * params.mouth_open;
      // mouth_form: -1(すぼめ) ~ 1(横広)
      // 横幅スケール: 0.7(すぼめ) ~ 1.3(横広)
      mouth.scale.x = 1.0 + params.mouth_form * 0.3;
    }

    // 眉
    const BROW_RANGE = 12;
    const browL = this.sprites.get("left_brow");
    const browR = this.sprites.get("right_brow");
    if (browL) {
      const base = this.parts.get("left_brow")!;
      const angryOffset = params.emotion === "angry" ? 8 : 0;
      browL.y = base.baseY - params.brow_left * BROW_RANGE + angryOffset;
      browL.x = params.emotion === "angry" ? base.baseX + 4 : base.baseX;
    }
    if (browR) {
      const base = this.parts.get("right_brow")!;
      const angryOffset = params.emotion === "angry" ? 8 : 0;
      browR.y = base.baseY - params.brow_right * BROW_RANGE + angryOffset;
      browR.x = params.emotion === "angry" ? base.baseX - 4 : base.baseX;
    }

    // 頬染め
    let blushAlpha = params.blush_intensity;
    if (params.emotion === "blush") blushAlpha = Math.min(1.0, blushAlpha + 0.7);
    if (params.emotion === "happy") blushAlpha = Math.min(1.0, blushAlpha + 0.3);
    if (params.emotion === "sad") blushAlpha = Math.min(0.3, blushAlpha + 0.1);
    const blL = this.sprites.get("blush_left");
    const blR = this.sprites.get("blush_right");
    if (blL) blL.alpha = blushAlpha;
    if (blR) blR.alpha = blushAlpha;

    // 視差スクロール + 呼吸（全体ボビング）
    const YAW_SCALE = 2.5;
    const PITCH_SCALE = 1.5;
    const ROLL_SCALE = 1.0;

    this.sprites.forEach((sprite, partId) => {
      const part = this.parts.get(partId);
      if (!part) return;

      // v3.2: 瞳・眉は独自変形済みなので視差スキップ
      if (PUPIL_BROW_PARTS.has(partId)) return;

      const dx = params.head_yaw * part.parallax * YAW_SCALE;
      const dy = params.head_pitch * part.parallax * PITCH_SCALE;
      const rollDx =
        params.head_roll *
        (sprite.baseY - 384) *
        0.005 *
        part.parallax *
        ROLL_SCALE;

      // v3.2: 全体ボビング（bodyパーツ不在のため全スプライトにY移動）
      const breathDy = params.breath_offset * part.parallax;

      if (!part.hasPhysics) {
        sprite.x = sprite.baseX + dx + rollDx;
        sprite.y = sprite.baseY + dy + breathDy;
      }
    });

    // 物理演算（髪揺れ）
    this.physics.forEach((physState, partId) => {
      const part = this.parts.get(partId);
      const sprite = this.sprites.get(partId);
      if (!part?.physicsConfig || !sprite) return;

      const newState = updatePhysics(
        physState,
        part.physicsConfig,
        params.head_yaw,
        params.head_pitch,
        deltaTime,
      );
      this.physics.set(partId, newState);

      const baseX =
        sprite.baseX + params.head_yaw * part.parallax * YAW_SCALE;
      const baseY =
        sprite.baseY +
        params.head_pitch * part.parallax * PITCH_SCALE +
        params.breath_offset * part.parallax;

      sprite.x = baseX + newState.offsetX;
      sprite.y = baseY + newState.offsetY;
      sprite.rotation = newState.angle;
    });
  }

  destroy(): void {
    this.app.destroy(true);
  }
}
