import { useEffect, useRef, useCallback } from "react";
import { EmotionType, KeyBinding } from "../types/avatar";

interface WinkState {
  left: boolean;
  right: boolean;
}

export function useKeyBindings(
  bindings: KeyBinding[],
  onEmotionChange: (emotion: EmotionType, intensity: number) => void,
  onWinkChange: (wink: WinkState) => void,
) {
  const activeEmotionRef = useRef<EmotionType>("neutral");
  const emotionTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const winkRef = useRef<WinkState>({ left: false, right: false });
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // テキスト入力中はキーバインド無効
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const binding = bindingsRef.current.find((b) => b.key === e.key);
      if (binding) {
        clearTimeout(emotionTimerRef.current);
        if (
          activeEmotionRef.current === binding.emotion &&
          binding.durationMs === 0
        ) {
          activeEmotionRef.current = "neutral";
          onEmotionChange("neutral", 0);
        } else {
          activeEmotionRef.current = binding.emotion;
          onEmotionChange(binding.emotion, 1.0);
          if (binding.durationMs > 0) {
            emotionTimerRef.current = setTimeout(() => {
              activeEmotionRef.current = "neutral";
              onEmotionChange("neutral", 0);
            }, binding.durationMs);
          }
        }
      }

      if (e.key === "q") {
        winkRef.current = {
          ...winkRef.current,
          left: !winkRef.current.left,
        };
        onWinkChange({ ...winkRef.current });
      }
      if (e.key === "e") {
        winkRef.current = {
          ...winkRef.current,
          right: !winkRef.current.right,
        };
        onWinkChange({ ...winkRef.current });
      }
    },
    [onEmotionChange, onWinkChange],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(emotionTimerRef.current);
    };
  }, [handleKeyDown]);
}
