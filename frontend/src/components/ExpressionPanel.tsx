import { KeyBinding } from "../types/avatar";

interface ExpressionPanelProps {
  bindings: KeyBinding[];
  onOpenEditor: () => void;
}

export default function ExpressionPanel({ bindings, onOpenEditor }: ExpressionPanelProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-gray-300 font-bold">キーバインド表情</h3>
        <button
          onClick={onOpenEditor}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          設定
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {bindings.map((b) => (
          <div key={b.key} className="flex items-center gap-2 text-gray-400">
            <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs font-mono">
              {b.key}
            </kbd>
            <span>{b.label}</span>
            <span className="text-gray-600 text-xs">
              {b.durationMs > 0 ? `${b.durationMs / 1000}s` : "トグル"}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-gray-400">
          <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs font-mono">
            q
          </kbd>
          <span>左ウィンク</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs font-mono">
            e
          </kbd>
          <span>右ウィンク</span>
        </div>
      </div>
    </div>
  );
}
