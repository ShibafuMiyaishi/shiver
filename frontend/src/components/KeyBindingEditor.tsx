import { useState } from "react";
import { KeyBinding, EmotionType } from "../types/avatar";

const EMOTION_OPTIONS: { value: EmotionType; label: string }[] = [
  { value: "blush", label: "照れ" },
  { value: "sad", label: "泣き顔" },
  { value: "angry", label: "怒り" },
  { value: "surprised", label: "サプライズ" },
  { value: "happy", label: "笑顔" },
];

interface KeyBindingEditorProps {
  bindings: KeyBinding[];
  onChange: (bindings: KeyBinding[]) => void;
  onClose: () => void;
}

export default function KeyBindingEditor({ bindings, onChange, onClose }: KeyBindingEditorProps) {
  const [editBindings, setEditBindings] = useState<KeyBinding[]>([...bindings]);
  const [listening, setListening] = useState<number | null>(null);

  const handleKeyCapture = (index: number) => {
    setListening(index);
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        setListening(null);
        window.removeEventListener("keydown", handler);
        return;
      }
      setEditBindings(prev => prev.map((b, i) =>
        i === index ? { ...b, key: e.key } : b
      ));
      setListening(null);
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("keydown", handler);
  };

  const handleEmotionChange = (index: number, emotion: EmotionType) => {
    setEditBindings(prev => prev.map((b, i) =>
      i === index ? { ...b, emotion } : b
    ));
  };

  const handleDurationChange = (index: number, durationMs: number) => {
    setEditBindings(prev => prev.map((b, i) =>
      i === index ? { ...b, durationMs } : b
    ));
  };

  const handleSave = () => {
    onChange(editBindings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl p-5 max-w-md w-full">
        <h2 className="text-lg font-bold text-gray-200 mb-4">キーバインド設定</h2>

        <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
          {editBindings.map((binding, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-800 rounded-lg p-2">
              <button
                onClick={() => handleKeyCapture(i)}
                className={`w-10 text-center font-mono text-sm px-2 py-1 rounded ${
                  listening === i
                    ? "bg-blue-600 text-white animate-pulse"
                    : "bg-gray-700 text-gray-200 hover:bg-gray-600"
                }`}
              >
                {listening === i ? "..." : binding.key}
              </button>

              <select
                value={binding.emotion}
                onChange={(e) => handleEmotionChange(i, e.target.value as EmotionType)}
                className="flex-1 bg-gray-700 text-gray-200 text-sm rounded px-2 py-1 focus:outline-none"
              >
                {EMOTION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <select
                value={binding.durationMs}
                onChange={(e) => handleDurationChange(i, Number(e.target.value))}
                className="w-20 bg-gray-700 text-gray-200 text-sm rounded px-2 py-1 focus:outline-none"
              >
                <option value={0}>トグル</option>
                <option value={1000}>1秒</option>
                <option value={2000}>2秒</option>
                <option value={3000}>3秒</option>
                <option value={5000}>5秒</option>
              </select>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500 mb-3">
          キーをクリックしてから任意のキーを押すと変更できます。Escでキャンセル。
        </p>
        <p className="text-xs text-gray-500 mb-4">
          ウィンクキー: Q=左ウィンク, E=右ウィンク（固定）
        </p>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-gray-200 px-3 py-1.5 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
