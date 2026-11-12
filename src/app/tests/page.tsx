import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { probBest, lift, verdict, shares, type Arm } from "@/lib/stats";
import { showPct, fmt } from "@/lib/format";
import { Submit } from "@/components/ui";
import { armFromIdea, armFromOld, endExperiment, refreshSnapshot, saveArm, setArmStatus, startExperiment, suggestSubjects } from "@/lib/actions";
import { STARTER, VARS, type Step } from "@/lib/templates";

const METRICS: Record<string, string> = { open: "Открытия", reply: "Ответы", positive: "Ответы с интересом", registered: "Регистрации", profile: "Заполненные профили" };
type ArmRow = { id: string; label: string; name: string; steps: Step[]; status: string; inst_campaign_id: string | null; inst_stats: Record<string, number> | null; experiment_id: string | null };

async function counts(armId: string) {
  const c = async (col?: string, extra?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => { let q = base(); if (col) q = q.not(col, "is", null); if (extra) q = extra(q); return (await q).count ?? 0; };
  const base = () => db.from("creators").select("id", { count: "exact", head: true }).eq("arm_id", armId).not("first_sent_at", "is", null);
  const [sent, opened, replied, positive, registered, profile, bounced, queued] = await Promise.all([c(), c("opened_at"), c("replied_at", (q) => q.neq("reply_label", "ooo")), c("positive_at"), c("registered_at"), c("profile_done_at"), c("bounced_at"), db.from("creators").select("id", { count: "exact", head: true }).eq("arm_id", armId).not("queued_at", "is", null).then((r) => r.count ?? 0)]);
  return { sent, opened, replied, positive, registered, profile, bounced, queued };
}
const COL: Record<string, keyof Awaited<ReturnType<typeof counts>>> = { open: "opened", reply: "replied", positive: "positive", registered: "registered", profile: "profile" };

function StepEditor({ steps }: { steps: Step[] }) {
  const rows = [...steps, ...Array(Math.max(0, 4 - steps.length)).fill({ subject: "", body: "", delay_days: 3 })].slice(0, 4) as Step[];
  return <div className="flex flex-col gap-2">{rows.map((st, i) => <div key={i} className="step-ed">
    <div className="row"><b>{i === 0 ? "Письмо 1" : `Фоллоуап ${i}`}</b>{i > 0 && <label className="row muted" style={{ fontSize: 12.5 }}>через <input className="in" name={`delay${i}`} type="number" min={1} max={14} defaultValue={st.delay_days || 3} style={{ width: 60 }} /> дн. после предыдущего</label>}{i > 0 && <span className="muted" style={{ fontSize: 12 }}>пустой текст = шаг не нужен</span>}</div>
    {i === 0 ? <input className="in" name={`subject${i}`} defaultValue={st.subject} placeholder="Тема" aria-label="Тема" /> : <input type="hidden" name={`subject${i}`} value="" />}
    <textarea className="in" name={`body${i}`} rows={i === 0 ? 9 : 5} defaultValue={st.body} aria-label="Текст" /></div>)}
    <p className="muted" style={{ fontSize: 12 }}>Переменные: {VARS.map((v) => `{{${v}}}`).join(" ")}. {"{{line}}"} — личная первая строка от AI по их био и видео, {"{{ref_link}}"} — их личная ссылка на регистрацию.</p></div>;
}

export default async function Tests({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const sp = await searchParams;
  const [{ data: exps }, { data: armsAll }, s] = await Promise.all([db.from("experiments").select("*").order("started_at", { ascending: false }), db.from("arms").select("*").order("label"), getSettings()]);
  const arms = (armsAll ?? []) as ArmRow[];
  const running = (exps ?? []).find((e) => e.status === "running");
  const live = arms.filter((a) => running ? a.experiment_id === running.id : a.status === "active");
  const stats = Object.fromEntries(await Promise.all(live.map(async (a) => [a.id, await counts(a.id)] as const)));
  const metric = running?.metric ?? "reply";
  const useMetric = ["registered", "profile"].includes(metric) && live.reduce((x, a) => x + stats[a.id][COL[metric]], 0) < 10 ? "reply" : metric;
  const armsB: Arm[] = live.filter((a) => a.status === "active").map((a) => ({ id: a.id, n: stats[a.id].sent, k: stats[a.id][COL[useMetric]] }));
  const pb = probBest(armsB);
  const share = shares(armsB, s.min_arm_share);
  const split = Object.fromEntries(Object.entries(share).map(([k, v]) => [k, Math.round(v * 100)]));
  const base = armsB.find((a) => live.find((x) => x.id === a.id)?.label === "A") ?? armsB[0];
  const done = (exps ?? []).filter((e) => e.status === "done");
  const snap = s.instantly_snapshot;
  return <div className="flex flex-col gap-4" style={{ maxWidth: 1180 }}>
    <div><h1>Тесты писем</h1><p className="sub">Каждый вариант — отдельная кампания в Instantly с теми же ящиками, так что мы точно знаем, какое письмо получил каждый креатор и кто из них зарегистрировался. Трафик делится автоматически: лучшему варианту больше, но каждый получает минимум {Math.round(s.min_arm_share * 100)}%, пока идёт тест.</p></div>
    {sp.msg && <div className="note">{sp.msg}</div>}
    {running ? <section className="panel" style={{ padding: 18 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><div><span className="eyebrow">Идёт тест с {fmt(running.started_at)}</span><h2 style={{ fontSize: 21, marginTop: 4 }}>{running.name}</h2>{running.hypothesis && <p className="muted" style={{ marginTop: 2 }}>{running.hypothesis}</p>}</div>
        <div className="muted" style={{ fontSize: 13, textAlign: "right" }}>Цель: <b style={{ color: "var(--ink)" }}>{METRICS[metric]}</b>{useMetric !== metric && <div>Пока регистраций меньше 10, сравниваем по ответам</div>}</div></div>
      <div className="flex flex-col gap-3" style={{ marginTop: 14 }}>{live.map((a) => { const st = stats[a.id]; const p = pb[a.id] ?? 0; const v = verdict(p, st.sent, 100); const l = base && a.id !== base.id && st.sent >= 30 ? lift(base, { id: a.id, n: st.sent, k: st[COL[useMetric]] }) : null;
        return <div key={a.id} className="panel arm" style={{ background: a.status !== "active" ? "#fafafa" : undefined }}>
          <div className="arm-h"><span className="arm-l">{a.label}</span><b style={{ fontSize: 15 }}>{a.name}</b>{a.status !== "active" && <span className="tag">на паузе</span>}{v.text && a.status === "active" && <span className={`tag ${v.tag}`}>{v.text}</span>}
            <span className="muted" style={{ marginLeft: "auto", fontSize: 12.5 }}>Тема: «{a.steps[0]?.subject}»</span></div>
          <div className="facts2">
            <div className="fact"><b>{st.sent}</b><span>написали (в очереди {st.queued - st.sent > 0 ? st.queued - st.sent : 0})</span></div>
            <div className="fact"><b>{showPct(st.opened, st.sent)}</b><span>открыли · {st.opened}</span></div>
            <div className="fact"><b>{showPct(st.replied, st.sent)}</b><span>ответили · {st.replied}</span></div>
            <div className="fact"><b>{showPct(st.positive, st.sent)}</b><span>с интересом · {st.positive}</span></div>
            <div className="fact"><b>{showPct(st.registered, st.sent)}</b><span>регистрации · {st.registered}</span></div>
            <div className="fact"><b>{showPct(st.profile, st.sent)}</b><span>профили · {st.profile}</span></div>
          </div>
          {a.status === "active" && <div className="row" style={{ fontSize: 12.5 }}><span className="muted" style={{ width: 230 }}>Шанс, что это лучший вариант: <b style={{ color: "var(--ink)" }}>{armsB.every((x) => x.n >= 30) ? `${Math.round(p * 100)}%` : "ждём 30+ писем"}</b></span><div className="pbest" style={{ flex: 1, minWidth: 120 }}><i style={{ width: `${p * 100}%` }} /></div><span className="muted">новых креаторов сюда: {split[a.id] ?? 0}%</span></div>}
          {l && <div className="muted" style={{ fontSize: 12.5 }}>К варианту A: {l.mid >= 0 ? "+" : ""}{Math.round(l.mid * 100)}% (скорее всего между {Math.round(l.lo * 100)}% и {Math.round(l.hi * 100)}%)</div>}
          {a.inst_stats && <div className="muted" style={{ fontSize: 12 }}>По данным Instantly: отправлено писем {a.inst_stats.emails_sent_count ?? 0}, уникальных открытий {a.inst_stats.open_count_unique ?? a.inst_stats.open_count ?? 0}, ответов {a.inst_stats.reply_count_unique ?? a.inst_stats.reply_count ?? 0}, баунсов {a.inst_stats.bounced_count ?? 0}</div>}
          <details><summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>Тексты и правка</summary>
            <form action={saveArm} className="flex flex-col gap-2" style={{ marginTop: 8 }}><input type="hidden" name="id" value={a.id} /><input className="in" name="name" defaultValue={a.name} aria-label="Название варианта" /><StepEditor steps={a.steps} />
              {st.sent > 0 && <div className="note">Этот вариант уже отправлялся. Правка поменяет письма для тех, кто ещё не получил шаг, и смешает результаты. Для новой идеи лучше добавь новый вариант.</div>}
              <div className="row"><Submit className="btn-p">Сохранить</Submit></div></form>
            <form action={setArmStatus} style={{ marginTop: 8 }}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value={a.status === "active" ? "paused" : "active"} /><Submit>{a.status === "active" ? "Поставить на паузу" : "Включить"}</Submit></form>
          </details>
        </div>; })}</div>
      <details style={{ marginTop: 14 }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>Завершить тест</summary>
        <form action={endExperiment} className="flex flex-col gap-2" style={{ marginTop: 8, maxWidth: 560 }}><input type="hidden" name="id" value={running.id} />
          <select className="in" name="winner" aria-label="Победитель">{live.map((a) => <option key={a.id} value={a.id}>{a.label}: {a.name} ({Math.round((pb[a.id] ?? 0) * 100)}%)</option>)}</select>
          <input className="in" name="result" placeholder="Что узнали (одной фразой)" aria-label="Вывод" />
          <p className="muted" style={{ fontSize: 12.5 }}>Победитель продолжит работать один, остальные встанут на паузу (уже начатые цепочки дойдут до конца). Следующий тест начнётся от победителя.</p>
          <div className="row"><Submit className="btn-p">Завершить</Submit></div></form></details>
    </section> : <section className="panel" style={{ padding: 18 }}><h2>Сейчас тест не идёт</h2><p className="muted" style={{ margin: "4px 0 10px" }}>{live.length ? `Работает победитель прошлого теста: ${live.map((a) => a.name).join(", ")}.` : "Первый тест создастся сам при первой отправке: ссылка в первом письме против просьбы ответить."}</p>
      <form action={startExperiment} className="flex flex-col gap-2" style={{ maxWidth: 560 }}><input className="in" name="name" placeholder="Что проверяем" required aria-label="Название теста" /><input className="in" name="hypothesis" placeholder="Почему думаем, что сработает" aria-label="Гипотеза" /><select className="in" name="metric" defaultValue="registered" aria-label="Цель">{Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>Цель: {v}</option>)}</select><div className="row"><Submit className="btn-p">Начать тест</Submit></div></form></section>}

    <section className="panel" style={{ padding: 18 }}><h2>Добавить вариант</h2><p className="muted" style={{ margin: "4px 0 10px" }}>Меняй одну вещь за раз (тему, первую строку, оффер, длину), иначе непонятно, что сработало. Новый вариант попадёт в текущий тест.</p>
      <details><summary className="btn" style={{ display: "inline-block" }}>Написать вариант с нуля</summary>
        <form action={saveArm} className="flex flex-col gap-2" style={{ marginTop: 10 }}><input className="in" name="name" placeholder="Название (что меняем)" required aria-label="Название" /><StepEditor steps={(live[0]?.steps ?? STARTER[0].steps)} /><div className="row"><Submit className="btn-p">Добавить</Submit></div></form></details>
      <div id="ideas" style={{ marginTop: 14 }}><div className="row"><b>Идеи тем от AI</b><form action={suggestSubjects}><Submit>{s.subject_ideas.length ? "Ещё идеи" : "Придумать темы"}</Submit></form></div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>AI смотрит на результаты всех вариантов и старых кампаний и предлагает темы с разными углами. Кнопка «Тестировать» копирует текущий лучший вариант и меняет только тему.</p>
        <div className="flex flex-col gap-1" style={{ marginTop: 8 }}>{s.subject_ideas.map((t) => <form key={t} action={armFromIdea} className="row" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}><input type="hidden" name="subject" value={t} /><span style={{ flex: 1 }}>«{t}»</span><Submit>Тестировать</Submit></form>)}</div></div>
    </section>

    <section className="panel" style={{ padding: 18 }}><div className="row" style={{ justifyContent: "space-between" }}><h2>Старые кампании в Instantly</h2><form action={refreshSnapshot}><Submit>Обновить</Submit></form></div>
      <p className="muted" style={{ margin: "4px 0 10px" }}>То, что вы отправляли до тулы. Это базовая линия: новые варианты должны быть не хуже. Хороший старый текст можно забрать как вариант.</p>
      {snap?.campaigns.length ? <div className="tw"><table className="t"><thead><tr><th>Кампания</th><th>Тема</th><th className="num">Лидов</th><th className="num">Писем</th><th className="num">Открыли</th><th className="num">Ответили</th><th></th></tr></thead><tbody>{snap.campaigns.filter((c) => !c.name.startsWith("Creators · ")).map((c) => <tr key={c.id}><td>{c.name}</td><td className="muted">{c.steps[0]?.subject || "—"}</td><td className="num">{c.leads}</td><td className="num">{c.sent}</td><td className="num">{showPct(c.opened, c.leads || c.sent)}</td><td className="num">{showPct(c.replied, c.leads || c.sent)}</td><td><form action={armFromOld}><input type="hidden" name="id" value={c.id} /><Submit>Забрать как вариант</Submit></form></td></tr>)}</tbody></table></div> : <p className="muted">Ещё не прочитаны: введи ключ Instantly и нажми «Подключить всё» в Настройках.</p>}
    </section>

    {done.length > 0 && <section className="panel" style={{ padding: 18 }}><h2>Завершённые тесты</h2>{done.map((e) => <div key={e.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}><b>{e.name}</b> <span className="muted">· {fmt(e.started_at)} — {fmt(e.ended_at)}</span><div className="muted">{e.result || "Без вывода"}{e.winner_arm ? ` · победил: ${arms.find((a) => a.id === e.winner_arm)?.name ?? "—"}` : ""}</div></div>)}</section>}
  </div>;
}
