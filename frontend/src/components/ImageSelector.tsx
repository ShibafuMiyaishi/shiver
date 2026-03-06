interface ImageSelectorProps {
  images: string[];
  onSelect: (index: number) => void;
  onCancel: () => void;
}

export default function ImageSelector({ images, onSelect, onCancel }: ImageSelectorProps) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl p-6 max-w-2xl w-full">
        <h2 className="text-lg font-bold text-gray-200 mb-4">
          ベース画像を選択してください
        </h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className="rounded-lg overflow-hidden border-2 border-gray-700 hover:border-blue-500 transition-colors focus:outline-none focus:border-blue-400"
            >
              <img
                src={`data:image/png;base64,${img}`}
                alt={`候補 ${i + 1}`}
                className="w-full h-auto"
              />
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
