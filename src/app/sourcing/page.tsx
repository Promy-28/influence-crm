import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { monthSpend, pipelineState } from "@/lib/sourcing";
import { fmtTime, showPct, PLATFORM } from "@/lib/format";
import { Submit, TabLink } from "@/components/ui";
import { addQuery, runSearch, toggleQuery } from "@/lib/actions";

type Q = { id: string; platform: string; kind: string; value: string; active: boolean; origin: string; runs: number; results: number; hits: number; last_run_at: string | null; found: number; approved: number; rejected: number; emailed: number; replied: number; registered: number };
export default async function Sourcing({ searchParams }: { searchParams: Promise<{ p?: string; msg?: string }> }) {
  const sp = await searchParams; const p = sp.p ?? "tiktok";
  const [{ data: qs }, { data: runs }, spend, s, pipe, { count: queue }] = await Promise.all([
    db.from("query_stats").select("*").eq("platform", p).order("active", { ascending: false }).order("approved", { ascending: false }).order("found", { ascending: false }),
    db.from("runs").select("*").order("started_at", { ascending: false }).limit(25), monthSpend(), getSettings(), pipelineState(),
    db.from("profile_queue").select("handle", { count: "exact", head: true }).eq("status", "new").eq("platform", p),
  ]);
  const list = (qs ?? []) as Q[];
  const seeds = list.filter((q) => q.kind === "profile"), searches = list.filter((q) => q.kind !== "profile");
  return <div className="flex flex-col gap-4">
    <div><h1>Поиск креаторов</h1><p className="sub">Автоматика сама запускает поиск, когда одобренных креаторов меньше чем на {s.review_buffer_days} дн. отправки. Сначала дешёвый поиск по хэштегам, потом проверка профиля только у тех, у кого в описании UGC и почта или ссылка. Хэштеги, которые используют одобренные тобой креаторы, добавляются сами.</p></div>
    {sp.msg && <div className="okbox">{sp.msg}</div>}
    <div className="grid-c">
      <div className="panel stat"><div className="muted">Apify за месяц</div><div className="v">${spend.toFixed(2)}</div><div className="bar"><i style={{ width: `${Math.min(100, (spend / s.apify_month_budget) * 100)}%` }} /></div><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>лимит ${s.apify_month_budget}</div></div>
      <div className="panel stat"><div className="muted">Ждут проверки профиля</div><div className="v">{queue ?? 0}</div><div className="muted" style={{ fontSize: 12 }}>{PLATFORM[p]}</div></div>
      <div className="panel stat"><div className="muted">Запас на отправку</div><div className="v">{pipe.daysCovered.toFixed(1)} дн.</div><div className="muted" style={{ fontSize: 12 }}>{pipe.ready} одобрено, {pipe.pending} на проверке, {pipe.perDay}/день</div></div>
    </div>
    <div className="row"><div className="tabs"><TabLink href="/sourcing?p=tiktok" on={p === "tiktok"}>TikTok</TabLink><TabLink href="/sourcing?p=instagram" on={p === "instagram"}>Instagram</TabLink></div>
      <form action={runSearch}><input type="hidden" name="platform" value={p} /><Submit className="btn-p">Запустить поиск сейчас</Submit></form>
      <form action={runSearch}><input type="hidden" name="platform" value={p} /><input type="hidden" name="stage" value="profile" /><Submit>Проверить очередь профилей</Submit></form>
      {seeds.length > 0 && <form action={runSearch}><input type="hidden" name="platform" value={p} /><input type="hidden" name="stage" value="seeds" /><Submit>Разобрать образцы</Submit></form>}</div>

    <section className="panel tw"><div style={{ padding: "14px 14px 4px" }}><h2>Что ищем и что это даёт</h2><p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Поиск выбирает сначала новые запросы, потом те, где больше одобренных. Выключай запросы, которые приносят мусор.</p></div>
      <table className="t"><thead><tr><th>Запрос</th><th>Откуда</th><th className="num">Запусков</th><th className="num">Найдено</th><th className="num">Одобрено</th><th className="num">Написали</th><th className="num">Ответили</th><th className="num">Регистраций</th><th>Последний</th><th></th></tr></thead>
        <tbody>{searches.map((q) => <tr key={q.id} style={{ opacity: q.active ? 1 : 0.5 }}><td><b>{q.kind === "hashtag" ? "#" : "🔍 "}{q.value}</b></td><td className="muted">{q.origin === "learned" ? `из одобренных (${q.hits})` : q.origin === "seed" ? "образец" : "вручную"}</td><td className="num">{q.runs}</td><td className="num">{q.found}</td><td className="num">{q.approved} <span className="muted">{q.found ? `(${showPct(q.approved, q.found, 0)})` : ""}</span></td><td className="num">{q.emailed}</td><td className="num">{q.replied}</td><td className="num">{q.registered}</td><td className="muted">{q.last_run_at ? fmtTime(q.last_run_at) : "—"}</td>
          <td><form action={toggleQuery}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="active" value={q.active ? "0" : "1"} /><input type="hidden" name="back" value={`/sourcing?p=${p}`} /><Submit>{q.active ? "Выключить" : "Включить"}</Submit></form></td></tr>)}</tbody></table>
      <form action={addQuery} className="row" style={{ padding: 14 }}><input type="hidden" name="platform" value={p} /><input type="hidden" name="back" value={`/sourcing?p=${p}`} /><select className="in" name="kind" aria-label="Тип"><option value="hashtag">Хэштеги</option>{p === "tiktok" && <option value="search">Поисковые фразы</option>}<option value="profile">Образцы (аккаунты)</option></select><input className="in" name="value" placeholder="через запятую: ugcmom, ugcfitness" style={{ flex: 1, minWidth: 240 }} aria-label="Значения" /><Submit className="btn-p">Добавить</Submit></form></section>

    {seeds.length > 0 && <section className="panel" style={{ padding: 18 }}><h2>Образцы</h2><p className="muted" style={{ fontSize: 12.5, margin: "4px 0 8px" }}>Креаторы, похожих на которых ищем. Тула забирает их хэштеги в поиск. «Разобрать образцы» запускает это сейчас.</p><div className="row">{seeds.map((q) => <a key={q.id} className="tag" href={p === "tiktok" ? `https://www.tiktok.com/@${q.value}` : `https://www.instagram.com/${q.value}/`} target="_blank" rel="noreferrer">@{q.value}</a>)}</div></section>}

    <section className="panel tw"><div style={{ padding: "14px 14px 4px" }}><h2>Последние запуски</h2></div><table className="t"><thead><tr><th>Когда</th><th>Что</th><th>Статус</th><th className="num">Строк</th><th className="num">Аккаунтов</th><th className="num">Новых</th><th className="num">$</th></tr></thead>
      <tbody>{(runs ?? []).map((r) => <tr key={r.id}><td>{fmtTime(r.started_at)}</td><td>{PLATFORM[r.platform]} · {r.stage === "discover" ? "поиск" : "профили"}</td><td>{r.status === "running" ? <span className="tag warn">идёт</span> : r.status === "done" ? <span className="tag good">готово</span> : <span className="tag bad" title={r.error ?? ""}>ошибка</span>}{r.error && r.status !== "failed" && <span className="muted" style={{ fontSize: 12 }}> {r.error}</span>}{r.status === "failed" && <div className="muted" style={{ fontSize: 12 }}>{r.error}</div>}</td><td className="num">{r.items}</td><td className="num">{r.profiles}</td><td className="num">{r.new_creators}</td><td className="num">{Number(r.cost_usd).toFixed(2)}</td></tr>)}</tbody></table>
      {!runs?.length && <p className="muted" style={{ padding: 14 }}>Запусков ещё не было.</p>}</section>
  </div>;
}
