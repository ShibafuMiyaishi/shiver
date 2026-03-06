import { useState } from "react";

interface PartStatus {
  name: string;
  partId: string;
  hasImage: boolean;
  imageB64?: string;
}

interface PartEditorProps {
  parts: PartStatus[];
  onRegenerate: (partId: string) => void;
  onConfirm: () => void;
  isRegenerating: string | null;
}

export default function PartEditor({ parts, onRegenerate, onConfirm, isRegenerating }: PartEditorProps) {
  const [selectedPart, setSelectedPart] = useState<string | null>(null);

  const successCount = parts.filter(p => p.hasImage).length;

  return (
    <div className="bg-gray-900 rounded-xl p-4 max-w-lg w-full">
      <h2 className="text-lg font-bold text-gray-200 mb-2">パーツ確認</h2>
      <p className="text-sm text-gray-400 mb-3">
        {successCount}/{parts.length} パーツ生成完了
      </p>

      <div className="grid grid-cols-3 gap-2 mb-4 max-h-64 overflow-y-auto">
        {parts.map((part) => (
          <button
            key={part.partId}
            onClick={() => setSelectedPart(part.partId === selectedPart ? null : part.partId)}
            className={`p-2 rounded-lg text-xs text-left transition-colors ${
              part.partId === selectedPart
                ? "bg-blue-600/30 border border-blue-500"
                : part.hasImage
                  ? "bg-gray-800 border border-gray-700 hover:border-gray-500"
                  : "bg-red-900/30 border border-red-700"
            }`}
          >
            <div className="font-mono text-gray-300 truncate">{part.partId}</div>
            <div className={part.hasImage ? "text-green-400" : "text-red-400"}>
              {part.hasImage ? "OK" : "失敗"}
            </div>
          </button>
        ))}
      </div>

      {selectedPart && (
        <div className="mb-4 space-y-2">
          {parts.find(p => p.partId === selectedPart)?.imageB64 && (
            <img
              src={`data:image/png;base64,${parts.find(p => p.partId === selectedPart)!.imageB64}`}
              alt={selectedPart}
              className="w-32 h-32 object-contain bg-gray-800 rounded mx-auto"
            />
          )}
          <button
            onClick={() => onRegenerate(selectedPart)}
            disabled={isRegenerating !== null}
            className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-3 py-1.5 rounded transition-colors"
          >
            {isRegenerating === selectedPart ? "再生成中..." : "このパーツを再生成"}
          </button>
        </div>
      )}

      <button
        onClick={onConfirm}
        disabled={successCount === 0}
        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg transition-colors"
      >
        このパーツ構成でアバターを作成
      </button>
    </div>
  );
}
