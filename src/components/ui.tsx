"use client";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
export function Submit({ children, className = "btn", formAction }: { children: React.ReactNode; className?: string; formAction?: (f: FormData) => void | Promise<void> }) {
  const { pending } = useFormStatus();
  return <button type="submit" formAction={formAction} disabled={pending} className={className}>{pending ? "…" : children}</button>;
}
export function CopyButton({ text, label = "Копировать", className = "btn" }: { text: string; label?: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className={className} onClick={async () => { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? "Скопировано" : label}</button>;
}
export function PickAll({ name }: { name: string }) {
  return <input type="checkbox" aria-label="Выбрать все" onChange={(e) => document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach((c) => (c.checked = e.target.checked))} />;
}
export function CopyPicked({ name }: { name: string }) {
  const [ok, setOk] = useState(0);
  return <button type="button" className="btn" onClick={async () => {
    const links = [...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((c) => c.dataset.link).filter(Boolean);
    await navigator.clipboard.writeText(links.join("\n")); setOk(links.length); setTimeout(() => setOk(0), 1500);
  }}>{ok ? `Скопировано: ${ok}` : "Скопировать ссылки для Helper"}</button>;
}
// Filters apply on change, with a visible pending state.
export function Filters({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const apply = (form: HTMLFormElement) => {
    const q = new URLSearchParams();
    new FormData(form).forEach((v, k) => { if (typeof v === "string" && v.trim()) q.set(k, v.trim()); });
    setPending(true); window.location.assign(`${path}${q.size ? `?${q}` : ""}`);
  };
  return <form className="row" onSubmit={(e) => { e.preventDefault(); apply(e.currentTarget); }}
    onChange={(e) => { const f = e.currentTarget; clearTimeout(timer.current); timer.current = setTimeout(() => apply(f), (e.target as HTMLElement).tagName === "INPUT" ? 700 : 0); }}>
    {children}{pending && <span className="muted">Загрузка…</span>}</form>;
}
// Plain anchors on purpose: client-side router transitions intermittently stalled on these pages in production.
export function TabLink({ href, on, children }: { href: string; on?: boolean; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  return <a href={href} onClick={() => setBusy(true)} className={on ? "tab on" : "tab"} style={busy && !on ? { opacity: .5 } : undefined}>{children}</a>;
}
export function AutoSelect({ children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} onChange={(e) => e.currentTarget.form?.requestSubmit()}>{children}</select>;
}
export function FileToText({ target }: { target: string }) {
  return <label className="btn">Загрузить CSV<input type="file" accept=".csv,.txt,text/csv" hidden onChange={async (e) => { const file = e.target.files?.[0]; const el = document.querySelector<HTMLTextAreaElement>(`textarea[name="${target}"]`); if (file && el) el.value = await file.text(); }} /></label>;
}
export function CopyField({ id, label = "Скопировать" }: { id: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className="btn" onClick={async () => { const el = document.getElementById(id) as HTMLTextAreaElement | null; if (el) { await navigator.clipboard.writeText(el.value); setOk(true); setTimeout(() => setOk(false), 1500); } }}>{ok ? "Скопировано" : label}</button>;
}
