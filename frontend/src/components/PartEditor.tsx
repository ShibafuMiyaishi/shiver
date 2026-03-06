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
  onReorder?: (orderedPartIds: string[]) => void;
  isRegenerating: string | null;
}

export default function PartEditor({
  parts,
  onRegenerate,
  onConfirm,
  onReorder,
  isRegenerating,
}: PartEditorProps) {
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [showZOrder, setShowZOrder] = useState(false);
  const [orderedParts, setOrderedParts] = useState<PartStatus[]>(parts);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const successCount = parts.filter((p) => p.hasImage).length;

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    const newOrder = [...orderedParts];
    const [moved] = newOrder.splice(dragIndex, 1);
    newOrder.splice(index, 0, moved);
    setOrderedParts(newOrder);
    setDragIndex(index);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    if (onReorder) {
      onReorder(orderedParts.map((p) => p.partId));
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl p-4 max-w-lg w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-gray-200">パーツ確認</h2>
        <button
          onClick={() => {
            if (!showZOrder) setOrderedParts([...parts]);
            setShowZOrder(!showZOrder);
          }}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {showZOrder ? "一覧に戻る" : "描画順変更"}
        </button>
      </div>
      <p className="text-sm text-gray-400 mb-3">
        {successCount}/{parts.length} パーツ生成完了
      </p>

      {showZOrder ? (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">
            ドラッグ＆ドロップで描画順を変更（上=奥、下=手前）
          </p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {orderedParts.map((part, i) => (
              <div
                key={part.partId}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-2 p-2 rounded text-sm cursor-move select-none ${
                  dragIndex === i
                    ? "bg-blue-600/30 border border-blue-500"
                    : "bg-gray-800 border border-gray-700"
                }`}
              >
                <span className="text-gray-500 text-xs w-6">{i + 1}</span>
                <span className="text-gray-300 font-mono text-xs flex-1">
                  {part.partId}
                </span>
                <span
                  className={`text-xs ${part.hasImage ? "text-green-400" : "text-red-400"}`}
                >
                  {part.hasImage ? "OK" : "NG"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4 max-h-64 overflow-y-auto">
            {parts.map((part) => (
              <button
                key={part.partId}
                onClick={() =>
                  setSelectedPart(
                    part.partId === selectedPart ? null : part.partId,
                  )
                }
                className={`p-2 rounded-lg text-xs text-left transition-colors ${
                  part.partId === selectedPart
                    ? "bg-blue-600/30 border border-blue-500"
                    : part.hasImage
                      ? "bg-gray-800 border border-gray-700 hover:border-gray-500"
                      : "bg-red-900/30 border border-red-700"
                }`}
              >
                <div className="font-mono text-gray-300 truncate">
                  {part.partId}
                </div>
                <div
                  className={part.hasImage ? "text-green-400" : "text-red-400"}
                >
                  {part.hasImage ? "OK" : "失敗"}
                </div>
              </button>
            ))}
          </div>

          {selectedPart && (
            <div className="mb-4 space-y-2">
              {parts.find((p) => p.partId === selectedPart)?.imageB64 && (
                <img
                  src={`data:image/png;base64,${parts.find((p) => p.partId === selectedPart)!.imageB64}`}
                  alt={selectedPart}
                  className="w-32 h-32 object-contain bg-gray-800 rounded mx-auto"
                />
              )}
              <button
                onClick={() => onRegenerate(selectedPart)}
                disabled={isRegenerating !== null}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-3 py-1.5 rounded transition-colors"
              >
                {isRegenerating === selectedPart
                  ? "再生成中..."
                  : "このパーツを再生成"}
              </button>
            </div>
          )}
        </>
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
