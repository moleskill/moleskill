"use client";

import { useEffect, useRef } from "react";

export function Sheet({ open, onClose, title, closeLabel, children }: { open: boolean; onClose: () => void; title: string; closeLabel: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === ref.current) onClose(); }} aria-label={title} className="m-auto w-[min(34rem,calc(100vw-1.5rem))] max-w-none rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/45 open:animate-[sheet-in_var(--motion-base)_var(--ease-out)]">
    <div className="border-b border-line px-5 py-4"><div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong md:hidden" /><div className="flex items-center justify-between gap-4"><h2 className="font-semibold">{title}</h2><button className="btn btn-ghost min-h-11" onClick={onClose} aria-label={closeLabel}>×</button></div></div>
    <div className="p-5">{children}</div>
  </dialog>;
}

export function ConfirmSheet({ open, onClose, title, children, confirmLabel, cancelLabel, closeLabel, onConfirm }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; confirmLabel: string; cancelLabel: string; closeLabel: string; onConfirm: () => void }) {
  return <Sheet open={open} onClose={onClose} title={title} closeLabel={closeLabel}><p className="text-sm text-muted">{children}</p><div className="mt-5 flex justify-end gap-2"><button className="btn btn-ghost min-h-11" autoFocus onClick={onClose}>{cancelLabel}</button><button className="btn btn-primary min-h-11" onClick={onConfirm}>{confirmLabel}</button></div></Sheet>;
}
