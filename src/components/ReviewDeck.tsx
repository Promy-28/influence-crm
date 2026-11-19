"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { decide } from "@/lib/actions";
import PostPreview from './PostPreview';

export type Card = {
  id: string; platform: string; handle: string; name: string | null; bio: string | null; email: string | null; email_source: string | null;
  profile_url: string | null; avatar_url: string | null; followers: number | null; likes: number | null; posts_7d: number | null; avg_views: number | null;
  last_post_at: string | null; region: string | null; ai_score: number | null; ai_verdict: string | null; ai_reasons: string | null; ai_line: string | null;
  ai_us: boolean | null; ai_english: boolean | null; rule_flags: string[]; recent_posts: { url: string; cover?: string | null; media_url?:string|null; caption?: string | null; views?: number | null; at?: string | null }[]; query: string | null; bio_link: string | null;
};
export const REASONS = ["Инфлюенсер, не UGC", "Не США", "Не английский", "Нет лица в кадре", "Слабое качество видео", "Не креатор / бренд", "Другое"];
const VERDICT: Record<string, string> = { ugc: "UGC-креатор", influencer: "Инфлюенсер", not_creator: "Не креатор", unclear: "Неясно" };
const n = (v?: number | null) => (v === null || v === undefined ? "—" : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}K` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(v));
const ago = (d?: string | null) => { if (!d) return "—"; const h = (Date.now() - new Date(d).getTime()) / 36e5; return h < 24 ? `${Math.max(1, Math.floor(h))} ч назад` : `${Math.floor(h / 24)} дн назад`; };
const FLAG: Record<string, string> = { influencer_words: "слова инфлюенсера в био", no_ugc_bio: "нет UGC в био", email_in_link: "почта из ссылки", not_us_bio: "другая страна в био", too_big: "много подписчиков" };

export function ReviewDeck({ initial, flagText }: { initial: Card[]; flagText?: Record<string, string> }) {
  const [list, setList] = useState(initial);
  const [i, setI] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [history, setHistory] = useState<{ card: Card; idx: number }[]>([]);
  const [done, setDone] = useState({ a: 0, r: 0 });
  const [err, setErr] = useState("");
  const [, start] = useTransition();
  const c = list[i];

  const act = useCallback((d: "approved" | "rejected", reason?: string) => {
    if (!c) return;
    setHistory((h) => [...h.slice(-20), { card: c, idx: i }]);
    setDone((x) => ({ a: x.a + (d === "approved" ? 1 : 0), r: x.r + (d === "rejected" ? 1 : 0) }));
    setList((l) => l.filter((x) => x.id !== c.id)); setRejecting(false);
    setI((x) => Math.max(0, Math.min(x, list.length - 2)));
    start(async () => { const r = await decide(c.id, d, reason); if (!r.ok) setErr(r.error ?? "Не сохранилось"); });
  }, [c, i, list.length]);
  const undo = useCallback(() => {
    const last = history[history.length - 1]; if (!last) return;
    setHistory((h) => h.slice(0, -1)); setList((l) => { const x = [...l]; x.splice(last.idx, 0, last.card); return x; }); setI(last.idx);
    start(async () => { await decide(last.card.id, "pending"); });
  }, [history]);
  const skip = useCallback(() => { if (list.length > 1) setI((x) => (x + 1) % list.length); }, [list.length]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if(document.querySelector('dialog[open]'))return;
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (rejecting) { const num = Number(k); if (num >= 1 && num <= REASONS.length) act("rejected", REASONS[num - 1]); if (k === "escape") setRejecting(false); return; }
      if (k === "a" || k === "arrowright" || k === "ф") act("approved");
      else if (k === "r" || k === "arrowleft" || k === "к") setRejecting(true);
      else if (k === "s" || k === "arrowdown" || k === "ы") skip();
      else if (k === "z" || k === "я") undo();
      else if (k === "o" || k === "щ") window.open(c?.profile_url ?? "", "_blank");
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }, [act, rejecting, skip, undo, c]);

  if (!c) return <div className="panel" style={{ padding: 28, textAlign: "center" }}><h2>Всё проверено</h2><p className="muted" style={{ marginTop: 6 }}>Одобрено {done.a}, отклонено {done.r}. Новые креаторы появятся после следующего поиска.</p><a className="btn" style={{ marginTop: 12 }} href="/review">Обновить</a>{history.length > 0 && <button className="btn" style={{ marginLeft: 8 }} onClick={undo}>Отменить последнее</button>}</div>;
  const ft = { ...FLAG, ...(flagText ?? {}) };
  const scoreTag = c.ai_score === null ? "" : c.ai_score >= 75 ? "good" : c.ai_score >= 50 ? "warn" : "bad";
  return <div className="deck">
    <section className="panel card">
      {err && <div className="errbox">{err}</div>}
      <div className="who">
        {c.avatar_url ? <img className="ava" src={c.avatar_url} alt="" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} /> : <div className="ava" />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row"><a className="l" href={c.profile_url ?? "#"} target="_blank" rel="noreferrer" style={{ fontSize: 20, fontWeight: 700 }}>@{c.handle}</a><span className="tag">{c.platform === "tiktok" ? "TikTok" : "Instagram"}</span>{c.query && <span className="tag">нашли по {c.query}</span>}</div>
          <div className="muted" style={{ marginTop: 2 }}>{c.name} · {c.email} <span className="muted">({c.email_source === "bio_link" ? "из ссылки в био" : c.email_source === "business" ? "бизнес-почта" : "из био"})</span></div>
        </div>
        {c.ai_score !== null && <div style={{ textAlign: "right" }}><div className={`score ${scoreTag === "bad" ? "bad-n" : ""}`}>{c.ai_score}</div><span className={`tag ${scoreTag}`}>{VERDICT[c.ai_verdict ?? ""] ?? "—"}</span></div>}
      </div>
      <div className="bio">{c.bio || "Описание пустое"}{c.bio_link && <><br /><a className="l" href={c.bio_link} target="_blank" rel="noreferrer">{c.bio_link}</a></>}</div>
      <div className="facts2">
        <div className="fact"><b>{n(c.followers)}</b><span>подписчиков</span></div>
        <div className="fact"><b>{ago(c.last_post_at)}</b><span>последний пост</span></div>
        <div className="fact"><b>{c.posts_7d ?? "—"}</b><span>постов за 7 дней</span></div>
        <div className="fact"><b>{n(c.avg_views)}</b><span>средние просмотры</span></div>
        <div className="fact"><b>{c.ai_us === null ? (c.region ?? "?") : c.ai_us ? "США" : "не США"}</b><span>страна{c.region ? ` (${c.region})` : ""}</span></div>
      </div>
      {(c.ai_reasons || c.rule_flags.some((f) => ft[f])) && <div className="ai"><b>AI:</b> {c.ai_reasons ?? "ещё не оценил"}{c.rule_flags.filter((f) => ft[f]).map((f) => <span key={f} className="tag warn" style={{ marginLeft: 6 }}>{ft[f]}</span>)}{c.ai_line && <div className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>Первая строка письма: «{c.ai_line}»</div>}</div>}
      <p className="review-media-note">Оценка AI выше — по био, подписям и данным профиля. Она не подтверждает просмотр видео и проверку речи. Ролики можно открыть ниже без платного пересбора.</p>
      <div className="posts">{c.recent_posts.slice(0, 6).map((p) => <PostPreview key={p.url} post={p} platform={c.platform} caption={p.caption||'без подписи'} meta={`${n(p.views)} просм. · ${ago(p.at)}`}/>)}</div>
      {rejecting ? <div className="flex flex-col gap-2"><b>Почему не подходит? Нажми цифру</b><div className="reasons">{REASONS.map((r, k) => <button key={r} className="btn" onClick={() => act("rejected", r)}><span className="kbd">{k + 1}</span> {r}</button>)}<button className="btn" onClick={() => setRejecting(false)}>Отмена <span className="kbd">Esc</span></button></div></div>
        : <div className="row" style={{ gap: 10 }}><button className="btn-p big-btn" onClick={() => act("approved")}>Писать <span className="kbd" style={{ marginLeft: 6 }}>A</span></button><button className="btn-bad big-btn" onClick={() => setRejecting(true)}>Не подходит <span className="kbd" style={{ marginLeft: 6 }}>R</span></button><button className="btn" onClick={skip}>Пропустить <span className="kbd">S</span></button><button className="btn" onClick={undo} disabled={!history.length}>Отменить <span className="kbd">Z</span></button><a className="btn" href={c.profile_url ?? "#"} target="_blank" rel="noreferrer">Открыть профиль <span className="kbd">O</span></a></div>}
    </section>
    <aside className="panel" style={{ padding: 0 }}>
      <div style={{ padding: "14px 14px 8px" }}><b>Очередь: {list.length}</b><div className="muted" style={{ fontSize: 12.5 }}>За эту сессию: одобрено {done.a}, отклонено {done.r}</div></div>
      <div className="side-list">{list.slice(0, 60).map((x, k) => <button key={x.id} onClick={() => setI(k)} className={`mini ${k === i ? "on" : ""}`} style={{ width: "100%", textAlign: "left", background: k === i ? undefined : "none", border: 0, borderBottom: "1px solid var(--line)" }}>{x.avatar_url ? <img className="ava-s" src={x.avatar_url} alt="" referrerPolicy="no-referrer" /> : <span className="ava-s" />}<span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{x.handle}</span><span className="muted" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{x.ai_score ?? "…"}</span></button>)}</div>
    </aside>
  </div>;
}
