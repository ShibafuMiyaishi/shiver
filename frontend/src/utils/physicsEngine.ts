import { PhysicsConfig } from "../types/avatar";

export interface PhysicsState {
  velocityX: number;
  velocityY: number;
  offsetX: number;
  offsetY: number;
  angle: number;
  angularVelocity: number;
}

export function createPhysicsState(): PhysicsState {
  return {
    velocityX: 0,
    velocityY: 0,
    offsetX: 0,
    offsetY: 0,
    angle: 0,
    angularVelocity: 0,
  };
}

export function updatePhysics(
  state: PhysicsState,
  config: PhysicsConfig,
  headYaw: number,
  headPitch: number,
  deltaTime: number,
): PhysicsState {
  const dt = Math.min(deltaTime, 0.05);

  const forceX = -headYaw * 0.03;
  const forceY = headPitch * 0.02 + config.gravity * 9.8 * dt;

  const springForceX = -state.offsetX * config.stiffness * 80;
  const springForceY = -state.offsetY * config.stiffness * 80;

  const newVelX =
    (state.velocityX + (forceX + springForceX) * dt) *
    (1 - config.damping * dt * 10);
  const newVelY =
    (state.velocityY + (forceY + springForceY) * dt) *
    (1 - config.damping * dt * 10);

  const newOffsetX = state.offsetX + newVelX * dt * 60;
  const newOffsetY = state.offsetY + newVelY * dt * 60;

  const targetAngle = newOffsetX * 0.008;
  const angularSpring = -state.angle * config.stiffness * 60;
  const newAngularVel =
    (state.angularVelocity +
      (targetAngle - state.angle + angularSpring) * dt * 5) *
    (1 - config.damping * dt * 8);
  const newAngle = state.angle + newAngularVel * dt * 30;

  const maxRad = (config.maxAngle * Math.PI) / 180;
  const clampedAngle = Math.max(-maxRad, Math.min(maxRad, newAngle));

  return {
    velocityX: newVelX,
    velocityY: newVelY,
    offsetX: Math.max(-30, Math.min(30, newOffsetX)),
    offsetY: Math.max(-20, Math.min(20, newOffsetY)),
    angle: clampedAngle,
    angularVelocity: newAngularVel,
  };
}
