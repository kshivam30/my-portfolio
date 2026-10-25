import { useState, useEffect } from "react";

export default function Toast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    window.__addToast = (message, type = "success") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
    };
    return () => {
      delete window.__addToast;
    };
  }, []);

  return (
    <div className="fixed top-5 right-5 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-enter pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl shadow-lift border text-sm min-w-[280px] max-w-sm bg-white/95 backdrop-blur ${
            t.type === "success"
              ? "border-celadon-100 text-ink-900"
              : "border-coral-100 text-ink-900"
          }`}
        >
          <span
            className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
              t.type === "success" ? "bg-celadon-500" : "bg-coral-500"
            }`}
          />
          <span className="font-medium leading-snug">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
