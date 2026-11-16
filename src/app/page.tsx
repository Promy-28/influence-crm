import { all, db } from "@/lib/db";
import { getSettings, dailyNew } from "@/lib/settings";
import { pipelineState, monthSpend } from "@/lib/sourcing";
import { range, showPct, ago, fmtTime } from "@/lib/format";
import { Filters, Submit } from "@/components/ui";
import { pauseOutreach, startOutreach } from "@/lib/actions";
import { Bars, Funnel } from "@/components/Charts";

type Row = { first_sent_at: string | null; opened_at: string | null; replied_at: string | null; positive_at: string | null; registered_at: string | null; profile_done_at: string | null; first_video_at: string | null; reply_label: string | null; bounced_at: string | null };
const COLS = "first_sent_at,opened_at,replied_at,positive_at,registered_at,profile_done_at,first_video_at,reply_label,bounced_at";

async function cohort(from: string, to: string) {
  const rows = await all<Row>((f, t) => db.from("creators").select(COLS).gte("first_sent_at", from).lt("first_sent_at", to).range(f, t));
  const k = (col: keyof Row) => rows.filter((r) => r[col]).length;
  return { sent: rows.length, opened: k("opened_at"), replied: rows.filter((r) => r.replied_at && r.reply_label !== "ooo").length, positive: k("positive_at"), registered: k("registered_at"), profile: k("profile_done_at"), video: k("first_video_at"), bounced: k("bounced_at") };
}
async function activity(from: string, to: string) {
  const c = async (col: string) => (await db.from("creators").select("id", { count: "exact", head: true }).gte(col, from).lt(col, to)).count ?? 0;
  const [registered, profile, vids, found, approved] = await Promise.all([c("registered_at"), c("profile_done_at"),
    db.from("events").select("id", { count: "exact", head: true }).eq("type", "video").gte("at", from).lt("at", to).then((r) => r.count ?? 0),
    c("created_at"), db.from("events").select("id", { count: "exact", head: true }).eq("type", "approved").gte("at", from).lt("at", to).then((r) => r.count ?? 0)]);
  return { registered, profile, vids, found, approved };
}
function Delta({ now, before, pctPoints }: { now: number | null; before: number | null; pctPoints?: boolean }) {
  if (now === null || before === null || (!pctPoints && before === 0)) return null;
  const d = pctPoints ? now - before : before ? ((now - before) / before) * 100 : 100;
  if (Math.abs(d) < 0.05) return <span className="delta">=</span>;
  return <span className={`delta ${d > 0 ? "up" : "down"}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}{pctPoints ? " п.п." : "%"}</span>;
}

// Does the AI score predict who answers and signs up? Grouped by score band and by who approved.
async function scoreReport() {
  const rows = await all<{ ai_score: number | null; reviewed_by: string | null; opened_at: string | null; replied_at: string | null; reply_label: string | null; positive_at: string | null; registered_at: string | null }>((f, t) => db.from("creators").select("ai_score,reviewed_by,opened_at,replied_at,reply_label,positive_at,registered_at").not("first_sent_at", "is", null).not("queued_at", "is", null).range(f, t));
  const bands: [string, (x: number) => boolean][] = [["95+", (x) => x >= 95], ["90–94", (x) => x >= 90 && x < 95], ["85–89", (x) => x >= 85 && x < 90], ["80–84", (x) => x >= 80 && x < 85], ["ниже 80", (x) => x < 80]];
  const sum = (list: typeof rows) => ({ n: list.length, opened: list.filter((r) => r.opened_at).length, replied: list.filter((r) => r.replied_at && r.reply_label !== "ooo").length, positive: list.filter((r) => r.positive_at).length, registered: list.filter((r) => r.registered_at).length });
  return { bands: bands.map(([name, f]) => ({ name, ...sum(rows.filter((r) => r.ai_score !== null && f(r.ai_score))) })), byWho: [{ name: "Одобрил человек", ...sum(rows.filter((r) => r.reviewed_by)) }, { name: "Одобрено автоматически", ...sum(rows.filter((r) => !r.reviewed_by)) }] };
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string; msg?: string }> }) {
  const sp = await searchParams; const r = range(sp);
  const len = new Date(r.to).getTime() - new Date(r.from).getTime();
  const prevFrom = new Date(new Date(r.from).getTime() - len).toISOString().slice(0, 10);
  const [s, co, pco, act, pact, pipe, spend, sr] = await Promise.all([getSettings(), cohort(r.from, r.to), cohort(prevFrom, r.from), activity(r.from, r.to), activity(prevFrom, r.from), pipelineState(), monthSpend(), scoreReport()]);
  const cmp = sp.period !== "all";
  const rate = (a: number, b: number) => (b ? (a / b) * 100 : null);

  // Daily series from events (last 30 days or the period, whichever is shorter).
  const days: string[] = []; const start = new Date(Math.max(new Date(r.from).getTime(), Date.now() - 44 * 864e5));
  for (let d = new Date(start); d <= new Date(); d = new Date(d.getTime() + 864e5)) days.push(d.toISOString().slice(0, 10));
  const evs = await all<{ type: string; at: string; step: number }>((f, t) => db.from("events").select("type,at,step").in("type", ["sent", "replied", "registered", "profile_done"]).gte("at", days[0]).range(f, t));
  const per = (type: string, firstOnly = false) => days.map((d) => evs.filter((e) => e.type === type && e.at.startsWith(d) && (!firstOnly || e.step <= 1)).length);

  const warn: string[] = [];
  if (!s.instantly_key || !s.apify_key || !s.openai_key) warn.push("Не все ключи введены: Настройки → Ключи");
  if (!s.cron_url) warn.push("Автозапуск не подключён: Настройки → «Подключить всё»");
  else if (!s.last_tick_at || Date.now() - new Date(s.last_tick_at).getTime() > 20 * 6e4) warn.push(`Автоматика давно не запускалась (последний раз ${s.last_tick_at ? ago(s.last_tick_at) : "никогда"}). Проверь pg_cron в Supabase.`);
  if (pipe.daysCovered < 1 && s.send_start) warn.push(`Одобренных креаторов меньше чем на день отправки. Зайди в Проверку: там ${pipe.pending}.`);
  if (spend >= s.apify_month_budget * 0.9) warn.push(`Apify: потрачено $${spend.toFixed(0)} из $${s.apify_month_budget} за месяц`);

  const costPer = (n: number) => (n ? `$${(spend / n).toFixed(2)}` : "—");
  return <div className="flex flex-col gap-4">
    <div className="row" style={{ alignItems: "flex-end" }}><div><h1>Дашборд</h1><p className="sub">Ставки считаются по креаторам, которым первое письмо ушло за период. Регистрации, профили и видео — по дате события. {cmp && "Стрелка сравнивает с прошлым таким же периодом."}</p></div></div>
    <Filters><select className="in" name="period" defaultValue={sp.period ?? "30"}><option value="today">Сегодня</option><option value="7">7 дней</option><option value="30">30 дней</option><option value="90">90 дней</option><option value="all">Всё время</option><option value="custom">Свои даты</option></select>
      {sp.period === "custom" && <><input className="in" type="date" name="from" defaultValue={sp.from} aria-label="С" /><input className="in" type="date" name="to" defaultValue={sp.to} aria-label="По" /></>}</Filters>
    {sp.msg && <div className="okbox">{sp.msg}</div>}
    {(() => { const on = !!s.send_start && s.send_start <= new Date().toISOString().slice(0, 10); const later = !!s.send_start && !on;
      return <section className="panel" style={{ padding: 18, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", ...(on ? { background: "#f9fdf0", borderColor: "#dcefae" } : {}) }}>
        <div style={{ flex: 1, minWidth: 260 }}><div className="row"><h2 style={{ fontSize: 20 }}>Аутрич {on ? "работает" : later ? `стартует ${s.send_start}` : "выключен"}</h2>{on && <span className="tag lime">идёт</span>}</div>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{on ? `Каждые 5 минут тула разбирает ответы и докладывает одобренных в Instantly (до ${dailyNew(s)} новых в день). Apify при этом не тратится: поиск ${s.search_mode === "weekly" ? `раз в неделю, в ${["воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"][s.search_weekday]}` : s.search_mode === "off" ? "только вручную" : "когда запас кончается, не чаще раза в 90 минут"}. Готово к отправке: ${pipe.ready}.` : `По кнопке: включатся кампании в Instantly и уйдёт первая порция одобренных креаторов (готово ${pipe.ready}). Дальше всё само.`}</p></div>
        {on ? <form action={pauseOutreach}><Submit>Поставить на паузу</Submit></form> : <form action={startOutreach}><Submit className="btn-p big-btn">Запустить аутрич</Submit></form>}
      </section>; })()}
    {warn.map((w) => <div key={w} className="note">{w}</div>)}

    <div className="kpis">
      <div className="panel kpi"><span className="muted">Открытия</span><span className="v">{showPct(co.opened, co.sent)}</span><span className="d">{co.opened} из {co.sent} написанных {cmp && <Delta now={rate(co.opened, co.sent)} before={rate(pco.opened, pco.sent)} pctPoints />}</span></div>
      <div className="panel kpi"><span className="muted">Ответы</span><span className="v">{showPct(co.replied, co.sent)}</span><span className="d">{co.replied} ответили, {co.positive} с интересом {cmp && <Delta now={rate(co.replied, co.sent)} before={rate(pco.replied, pco.sent)} pctPoints />}</span></div>
      <div className="panel kpi hero"><span className="muted">Регистрации</span><span className="v">{act.registered}</span><span className="d">{showPct(co.registered, co.sent)} от написанных {cmp && <Delta now={act.registered} before={pact.registered} />}</span></div>
      <div className="panel kpi"><span className="muted">Заполнили профиль</span><span className="v">{act.profile}</span><span className="d">{showPct(co.profile, co.registered)} от зарегистрированных {cmp && <Delta now={act.profile} before={pact.profile} />}</span></div>
      <div className="panel kpi"><span className="muted">Видео получено</span><span className="v">{act.vids}</span><span className="d">от {co.video} креаторов {cmp && <Delta now={act.vids} before={pact.vids} />}</span></div>
    </div>

    <div className="two">
      <section className="panel" style={{ padding: 18 }}><h2>Воронка за {r.label}</h2><p className="muted" style={{ fontSize: 12.5, margin: "4px 0 12px" }}>Креаторы, которым первое письмо ушло за период, и что с ними стало дальше. Процент — от предыдущего шага.</p>
        <Funnel steps={[{ name: "Написали", v: co.sent }, { name: "Открыли", v: co.opened }, { name: "Ответили", v: co.replied }, { name: "С интересом", v: co.positive }, { name: "Зарегистрировались", v: co.registered }, { name: "Заполнили профиль", v: co.profile }, { name: "Прислали видео", v: co.video }]} />
        {co.bounced > 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Не доставлено (баунс): {co.bounced}, это {showPct(co.bounced, co.sent)}. Выше 3% бьёт по доменам.</p>}
      </section>
      <section className="panel" style={{ padding: 18 }}><h2>Поток креаторов</h2>
        <div className="facts2" style={{ marginTop: 12 }}>
          <a href="/sourcing" className="fact"><b>{act.found}</b><span>найдено за период</span></a>
          <a href="/review" className="fact"><b>{pipe.pending}</b><span>ждут проверки</span></a>
          <div className="fact"><b>{act.approved}</b><span>одобрено за период</span></div>
          <div className="fact"><b>{pipe.ready}</b><span>готовы к отправке</span></div>
          <div className="fact"><b>{dailyNew(s)}</b><span>новых в день помещается в ящики</span></div>
          <div className="fact"><b>{pipe.daysCovered.toFixed(1)}</b><span>дней отправки в запасе</span></div>
          <div className="fact"><b>${spend.toFixed(0)}</b><span>Apify за месяц из ${s.apify_month_budget}</span></div>
          <div className="fact"><b>{costPer(act.registered)}</b><span>Apify на 1 регистрацию за период</span></div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Автоматика: {s.last_tick_at ? `последний запуск ${fmtTime(s.last_tick_at)}` : "ещё не запускалась"}.</p>
      </section>
    </div>

    <div className="two">
      <section className="panel" style={{ padding: 18 }}><h2>Первых писем в день</h2><p className="muted" style={{ fontSize: 12.5, margin: "4px 0 8px" }}>Новые креаторы, которым ушло первое письмо. Фоллоуапы не считаются.</p><Bars title="Первые письма по дням" days={days} series={[{ name: "Первые письма", values: per("sent", true) }]} /></section>
      <section className="panel" style={{ padding: 18 }}><h2>Ответы и регистрации в день</h2><p className="muted" style={{ fontSize: 12.5, margin: "4px 0 8px" }}>Наведи на столбик, чтобы увидеть цифры за день.</p><Bars title="Ответы, регистрации, профили по дням" days={days} series={[{ name: "Ответы", values: per("replied") }, { name: "Регистрации", values: per("registered") }, { name: "Профили", values: per("profile_done") }]} /></section>
    </div>
    <section className="panel tw"><div style={{ padding: "16px 18px 6px" }}><h2>Оценка AI и результат</h2><p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Кому писали за всё время, по оценке AI на момент отбора. Если у низких оценок ответов и регистраций столько же, сколько у высоких, порог автоодобрения можно опустить, а если меньше — поднять. Делать выводы стоит от ~50 писем в строке.</p></div>
      <table className="t"><thead><tr><th>Оценка AI</th><th className="num">Написали</th><th className="num">Открыли</th><th className="num">Ответили</th><th className="num">С интересом</th><th className="num">Регистрации</th></tr></thead>
        <tbody>{[...sr.bands, ...sr.byWho].map((b, i) => <tr key={b.name} style={i === sr.bands.length ? { borderTop: "2px solid var(--line)" } : undefined}><td><b>{b.name}</b></td><td className="num">{b.n}</td><td className="num">{showPct(b.opened, b.n)}</td><td className="num">{showPct(b.replied, b.n)}</td><td className="num">{showPct(b.positive, b.n)}</td><td className="num">{b.registered} <span className="muted">{b.n ? `(${showPct(b.registered, b.n)})` : ""}</span></td></tr>)}</tbody></table></section>
  </div>;
}
