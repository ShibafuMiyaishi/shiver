export interface IdleState {
  breathPhase: number;
  nextBlinkTime: number;
  blinkPhase: "open" | "closing" | "opening";
  blinkProgress: number;
}

export function createIdleState(): IdleState {
  return {
    breathPhase: 0,
    nextBlinkTime: Date.now() + randomBlinkInterval(),
    blinkPhase: "open",
    blinkProgress: 0,
  };
}

function randomBlinkInterval(): number {
  return 3000 + Math.random() * 2000;
}

const BREATH_PERIOD_MS = 4000;
const BREATH_AMPLITUDE = 3;
const BLINK_CLOSE_MS = 80;
const BLINK_OPEN_MS  = 120;

export interface IdleOutput {
  breathOffsetY: number;
  autoBlinkValue: number;
}

export function updateIdle(
  state: IdleState,
  now: number,
  deltaMs: number,
): { state: IdleState; output: IdleOutput } {
  const newBreathPhase =
    (state.breathPhase + (deltaMs / BREATH_PERIOD_MS) * 2 * Math.PI) %
    (2 * Math.PI);
  const breathOffsetY = Math.sin(newBreathPhase) * BREATH_AMPLITUDE;

  let { nextBlinkTime, blinkPhase, blinkProgress } = state;
  let autoBlinkValue = 1.0;

  if (blinkPhase === "open") {
    if (now >= nextBlinkTime) {
      blinkPhase = "closing";
      blinkProgress = 0;
    }
  } else if (blinkPhase === "closing") {
    blinkProgress += deltaMs / BLINK_CLOSE_MS;
    if (blinkProgress >= 1.0) {
      blinkProgress = 0;
      blinkPhase = "opening";
    }
    autoBlinkValue = 1.0 - blinkProgress;
  } else {
    blinkProgress += deltaMs / BLINK_OPEN_MS;
    if (blinkProgress >= 1.0) {
      blinkPhase = "open";
      blinkProgress = 0;
      nextBlinkTime = now + randomBlinkInterval();
    }
    autoBlinkValue = blinkProgress;
  }

  return {
    state: {
      breathPhase: newBreathPhase,
      nextBlinkTime,
      blinkPhase,
      blinkProgress,
    },
    output: { breathOffsetY, autoBlinkValue },
  };
}
