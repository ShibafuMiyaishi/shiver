import { DEFAULT_KEY_BINDINGS } from "../types/avatar";

export default function ExpressionPanel() {
  return (
    <div className="bg-gray-800 rounded-lg p-3 text-sm">
      <h3 className="text-gray-300 font-bold mb-2">キーバインド表情</h3>
      <div className="grid grid-cols-2 gap-1">
        {DEFAULT_KEY_BINDINGS.map((b) => (
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
