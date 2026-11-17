"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";
const groups: [string, [string, string][]][] = [
  ["Работа", [["/", "Рабочий стол"], ["/review", "Проверка"], ["/inbox", "Почта"], ["/drafts", "Черновики"]]],
  ["База", [["/creators", "Креаторы"], ["/sourcing", "Поиск"]]],
  ["Анализ", [["/tests", "Тесты писем"], ["/mailboxes", "Ящики"], ["/analytics", "Аналитика"]]],
];
const more: [string, string][] = [["/guide", "Как пользоваться"], ["/import", "Импорт"], ["/log", "Журнал"], ["/settings", "Настройки"]];
const on = (p: string, h: string) => (h === "/" ? p === "/" : p.startsWith(h));
export function Nav({ counts }: { counts: Record<string, number> }) {
  const p = usePathname();
  const item = ([h, l]: [string, string]) => <a key={h} href={h} className={on(p, h) ? "nav-i on" : "nav-i"}><span>{l}</span>{counts[h] ? <span className="count">{counts[h]}</span> : null}</a>;
  return <><MobileBar counts={counts} p={p} /><nav className="nav">{groups.map(([g, items]) => <div key={g} style={{ display: "contents" }}><div className="nav-h">{g}</div>{items.map(item)}</div>)}
    <details className="nav-more" open={more.some(([h]) => p.startsWith(h))}><summary className="nav-i"><span>Остальное</span><span className="nav-arrow">›</span></summary><div className="nav-more-in">{more.map(item)}</div></details></nav></>;
}
const TABS: [string, string, string][] = [["/", "Рабочий стол", "M4 13h4v7H4zM10 4h4v16h-4zM16 9h4v11h-4z"], ["/review", "Проверка", "M20 6L9 17l-5-5"], ["/inbox", "Почта", "M21 12a8 8 0 01-11.7 7.1L4 20l1-4.6A8 8 0 1121 12z"], ["/creators", "Креаторы", "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0"]];
function MobileBar({ counts, p }: { counts: Record<string, number>; p: string }) {
  const [open, setOpen] = useState(false);
  const all = [...groups.flatMap(([, i]) => i), ...more];
  return <>
    <div className="mbar">{TABS.map(([h, l, d]) => <a key={h} href={h} className={on(p, h) ? "mtab on" : "mtab"}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg><span>{l}</span>{counts[h] ? <i>{counts[h] > 99 ? "99+" : counts[h]}</i> : null}</a>)}
      <button type="button" className={open ? "mtab on" : "mtab"} onClick={() => setOpen(!open)} aria-expanded={open}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg><span>Ещё</span></button></div>
    {open && <div className="msheet" onClick={() => setOpen(false)}><div className="msheet-in" onClick={(e) => e.stopPropagation()}>{all.map(([h, l]) => <a key={h} href={h} className={on(p, h) ? "msheet-i on" : "msheet-i"}><span>{l}</span>{counts[h] ? <span className="count">{counts[h]}</span> : null}</a>)}<form action={logout}><button className="msheet-i" style={{ width: "100%", color: "var(--muted)" }}>Выйти</button></form></div></div>}
  </>;
}

