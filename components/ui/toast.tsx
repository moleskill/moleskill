"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastInput = { message: string; actionLabel?: string; action?: () => void; duration?: number };
type ToastItem = ToastInput & { id: number };
const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const notify = useCallback((toast: ToastInput) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current.slice(-2), { ...toast, id }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), toast.duration ?? 8000);
  }, []);
  const value = useMemo(() => notify, [notify]);
  return <ToastContext.Provider value={value}>{children}<div className="fixed bottom-4 left-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" aria-relevant="additions">
    {items.map((item) => <div key={item.id} role="status" className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-lg">
      <span>{item.message}</span>{item.action && <><span aria-hidden="true" className="-mx-2 text-muted">·</span><button className="min-h-11 shrink-0 font-semibold text-accent" onClick={() => { item.action?.(); setItems((current) => current.filter((x) => x.id !== item.id)); }}>{item.actionLabel ?? "Undo"}</button></>}
    </div>)}
  </div></ToastContext.Provider>;
}

export function useToast() { return useContext(ToastContext); }
