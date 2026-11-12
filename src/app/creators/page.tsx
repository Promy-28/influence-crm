import { db } from "@/lib/db";
import { Filters } from "@/components/ui";
import { stage, STAGE_FILTERS, fmt, n, PLATFORM } from "@/lib/format";

const wrap = (s: string) => `%${s.replace(/[%,()]/g, " ")}%`;
export default async function Creators({ searchParams }: { searchParams: Promise<{ st?: string; p?: string; q?: string; arm?: string; page?: string }> }) {
  const sp = await searchParams; const page = Math.max(0, Number(sp.page ?? 0));
  let q = db.from("creators").select("id,platform,handle,name,email,avatar_url,followers,review_status,queued_at,first_sent_at,opened_at,replied_at,positive_at,registered_at,profile_done_at,first_video_at,videos,do_not_contact,bounced_at,unsubscribed_at,source,created_at,arms(label),queries(kind,value)", { count: "exact" });
  const st = sp.st ?? "";
  if (st === "video") q = q.not("first_video_at", "is", null); else if (st === "profile") q = q.not("profile_done_at", "is", null); else if (st === "registered") q = q.not("registered_at", "is", null);
  else if (st === "positive") q = q.not("positive_at", "is", null); else if (st === "replied") q = q.not("replied_at", "is", null); else if (st === "sent") q = q.not("first_sent_at", "is", null);
  else if (st === "queued") q = q.not("queued_at", "is", null).is("first_sent_at", null); else if (st === "approved") q = q.eq("review_status", "approved").is("queued_at", null);
  else if (st === "pending") q = q.eq("review_status", "pending"); else if (st === "rejected") q = q.in("review_status", ["rejected", "auto_rejected"]); else if (st === "existing") q = q.eq("review_status", "existing");
  if (sp.p) q = q.eq("platform", sp.p);
  if (sp.arm) q = q.eq("arm_id", sp.arm);
  if (sp.q) q = q.or(`handle.ilike.${wrap(sp.q)},email.ilike.${wrap(sp.q)},name.ilike.${wrap(sp.q)}`);
  const order = ["registered", "profile", "video"].includes(st) ? "registered_at" : ["replied", "positive"].includes(st) ? "replied_at" : ["sent"].includes(st) ? "first_sent_at" : "created_at";
  const [{ data, count }, { data: arms }] = await Promise.all([q.order(order, { ascending: false, nullsFirst: false }).range(page * 100, page * 100 + 99), db.from("arms").select("id,label,name").order("label")]);
  const qs = (o: Record<string, string | number>) => `/creators?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) })}`;
  return <div className="flex flex-col gap-4">
    <div><h1>Креаторы</h1><p className="sub">Все, кого нашли, кому написали и кто дошёл до регистрации. Нажми на креатора, чтобы увидеть всю историю.</p></div>
    <Filters><select className="in" name="st" defaultValue={st} aria-label="Этап">{STAGE_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select className="in" name="p" defaultValue={sp.p ?? ""} aria-label="Платформа"><option value="">TikTok и Instagram</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option></select>
      <select className="in" name="arm" defaultValue={sp.arm ?? ""} aria-label="Вариант письма"><option value="">Все варианты писем</option>{(arms ?? []).map((a) => <option key={a.id} value={a.id}>{a.label}: {a.name}</option>)}</select>
      <input className="in" name="q" defaultValue={sp.q} placeholder="Ник, почта, имя" aria-label="Поиск" /></Filters>
    <div className="panel tw"><table className="t"><thead><tr><th>Креатор</th><th>Этап</th><th className="num">Подп.</th><th>Вариант</th><th>Нашли</th><th>Написали</th><th>Регистрация</th><th className="num">Видео</th></tr></thead>
      <tbody>{(data ?? []).map((c) => { const [label, tag] = stage(c); const a = c.arms as unknown as { label: string } | null; const qq = c.queries as unknown as { kind: string; value: string } | null;
        return <tr key={c.id}><td><div className="row" style={{ flexWrap: "nowrap" }}>{c.avatar_url ? <img className="ava-s" src={c.avatar_url} alt="" referrerPolicy="no-referrer" /> : <span className="ava-s" />}<div><a className="l" href={`/creators/${c.id}`}>@{c.handle}</a><div className="muted" style={{ fontSize: 12 }}>{PLATFORM[c.platform]} · {c.email}</div></div></div></td>
          <td><span className={`tag ${tag}`}>{label}</span></td><td className="num">{n(c.followers)}</td><td>{a ? <span className="tag">{a.label}</span> : "—"}</td>
          <td className="muted" style={{ fontSize: 12.5 }}>{fmt(c.created_at)}{qq ? ` · ${qq.kind === "hashtag" ? "#" : ""}${qq.value}` : c.source !== "apify" ? ` · ${c.source.replace("import:", "")}` : ""}</td><td>{fmt(c.first_sent_at)}</td><td>{fmt(c.registered_at)}</td><td className="num">{c.videos || "—"}</td></tr>; })}</tbody></table>
      {!data?.length && <p className="muted" style={{ padding: 16 }}>Никого.</p>}</div>
    <div className="row"><span className="muted">Всего {count ?? 0}</span>{page > 0 && <a className="btn" href={qs({ page: page - 1 })}>← Назад</a>}{(count ?? 0) > (page + 1) * 100 && <a className="btn" href={qs({ page: page + 1 })}>Дальше →</a>}</div>
  </div>;
}
