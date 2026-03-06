import { useRef } from "react";

interface ProjectControlsProps {
  onSave: () => void;
  onLoad: (file: File) => void;
  canSave: boolean;
}

export default function ProjectControls({ onSave, onLoad, canSave }: ProjectControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex gap-2">
      <button
        onClick={onSave}
        disabled={!canSave}
        className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-200 text-sm px-3 py-1.5 rounded-lg transition-colors"
      >
        保存
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm px-3 py-1.5 rounded-lg transition-colors"
      >
        読み込み
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.shiver.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onLoad(file);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}
