import { useEffect, useState } from "react";

interface ErrorToastProps {
  message: string | null;
  onDismiss: () => void;
}

export default function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 300);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      className={`fixed top-4 right-4 max-w-sm bg-red-900 border border-red-700 text-white px-4 py-3 rounded-lg shadow-lg transition-opacity duration-300 z-50 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-red-300 shrink-0">!</span>
        <p className="text-sm">{message}</p>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onDismiss, 300);
          }}
          className="text-red-300 hover:text-white ml-auto shrink-0"
        >
          x
        </button>
      </div>
    </div>
  );
}
