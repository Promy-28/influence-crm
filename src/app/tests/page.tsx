import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { probBest, verdict, type Arm } from "@/lib/stats";
import { showPct, fmt } from "@/lib/format";
import { Submit } from "@/components/ui";
import { armFromIdea, armFromOld, endExperiment, refreshSnapshot, saveArm, setArmStatus, startHypothesis, suggestSubjects } from "@/lib/actions";
import { HYPOTHESES, METRIC_NAME, STARTER, VARS, nextFocus, type Step } from "@/lib/templates";
import { fill } from "@/lib/text";

type ArmRow = { id: string; label: string; name: string; steps: Step[]; status: string; inst_campaign_id: string | null; experiment_id: string | null };
type Counts = { sent: number; opened: number; replied: number; registered: number; profile: number; queued: number };
const METRIC_COL: Record<string, keyof Counts> = { open: "opened", reply: "replied", positive: "replied", registered: "registered", profile: "profile" };

async function counts(armId: string | null): Promise<Counts> {
  let q = db.from("creators").select("first_sent_at,opened_at,replied_at,reply_label,registered_at,profile_done_at,queued_at").not("queued_at", "is", null);
  if (armId) q = q.eq("arm_id", armId);
  const { data } = await q.limit(50000);
  const rows = (data ?? []) as Record<string, string | null>[]; const sent = rows.filter((r) => r.first_sent_at);
  return { queued: rows.length, sent: sent.length, opened: sent.filter((r) => r.opened_at).length, replied: sent.filter((r) => r.replied_at && r.reply_label !== "ooo").length, registered: sent.filter((r) => r.registered_at).length, profile: sent.filter((r) => r.profile_done_at).length };
}
const SAMPLE = { firstName: "Jess", line: "Your morning routine video felt so natural, the coffee part made me laugh.", ref_link: "promy.io/influencers?ref=k7m2x9p", handle: "jessugc", platform: "tiktok", sendingAccountFirstName: "Mark" };
const Preview = ({ steps }: { steps: Step[] }) => <div className="flex flex-col gap-2">{steps.map((s, i) => <div key={i}><div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{i === 0 ? `Письмо 1 · тема: «${fill(s.subject, SAMPLE)}»` : `Фоллоуап ${i} · через ${s.delay_days} дн., в той же ветке`}</div><div className="prev">{fill(s.body, SAMPLE)}</div></div>)}</div>;

function StepEditor({ steps }: { steps: Step[] }) {
  const rows = [...steps, ...Array(Math.max(0, 3 - steps.length)).fill({ subject: "", body: "", delay_days: 3 })].slice(0, 3) as Step[];
  return <div className="flex flex-col gap-2">{rows.map((st, i) => <div key={i} className="step-ed">
    <div className="row"><b>{i === 0 ? "Письмо 1" : `Фоллоуап ${i}`}</b>{i > 0 && <label className="row muted" style={{ fontSize: 12.5 }}>через <input className="in" name={`delay${i}`} type="number" min={1} max={14} defaultValue={st.delay_days || 3} style={{ width: 60 }} /> дн.</label>}{i > 0 && <span className="muted" style={{ fontSize: 12 }}>пусто = без этого письма</span>}</div>
    {i === 0 ? <input className="in" name={`subject${i}`} defaultValue={st.subject} placeholder="Тема" aria-label="Тема" /> : <input type="hidden" name={`subject${i}`} value="" />}
    <textarea className="in" name={`body${i}`} rows={i === 0 ? 10 : 5} defaultValue={st.body} aria-label="Текст" /></div>)}
    <p className="muted" style={{ fontSize: 12 }}>Переменные: {VARS.map((v) => `{{${v}}}`).join(" ")}. {"{{line}}"} — личная первая строка от AI по их видео, {"{{ref_link}}"} — их личная ссылка на регистрацию.</p></div>;
}

export default async function Tests({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const sp = await searchParams;
  const [{ data: exps }, { data: armsAll }, s, total] = await Promise.all([db.from("experiments").select("*").order("started_at", { ascending: false }), db.from("arms").select("id,label,name,steps,status,inst_campaign_id,experiment_id").order("label"), getSettings(), counts(null)]);
  const arms = (armsAll ?? []) as ArmRow[];
  const running = (exps ?? []).find((e) => e.status === "running");
  const live = running ? arms.filter((a) => a.experiment_id === running.id) : arms.filter((a) => a.status === "active");
  const stats: Record<string, Counts> = Object.fromEntries(await Promise.all(live.map(async (a) => [a.id, await counts(a.id)] as const)));
  const metric = running?.metric ?? "reply";
  const useMetric = ["registered", "profile"].includes(metric) && live.reduce((x, a) => x + stats[a.id][METRIC_COL[metric]], 0) < 10 ? "reply" : metric;
  const pb = probBest(live.filter((a) => a.status === "active").map((a): Arm => ({ id: a.id, n: stats[a.id].sent, k: stats[a.id][METRIC_COL[useMetric]] })));
  const enough = live.every((a) => stats[a.id].sent >= 30);
  const focus = nextFocus(total.sent, total.sent ? total.opened / total.sent : null, total.sent ? total.replied / total.sent : null, total.replied >= 10 ? total.registered / total.replied : null);
  const testedIds = new Set((exps ?? []).map((e) => e.hypothesis_id).filter(Boolean));
  const done = (exps ?? []).filter((e) => e.status === "done");
  const snap = s.instantly_snapshot;
  const best = live.slice().sort((a, b) => (pb[b.id] ?? 0) - (pb[a.id] ?? 0))[0];

  return <div className="flex flex-col gap-4" style={{ maxWidth: 1100 }}>
    <div><h1>Тесты писем</h1><p className="sub">Два варианта письма идут одновременно. Тула сама отдаёт больше креаторов тому, что работает лучше, и говорит, когда победитель ясен. Ты выбираешь, что тестировать дальше.</p></div>
    {sp.msg && <div className="note">{sp.msg}</div>}

    <section className="panel" style={{ padding: 18 }}>
      <span className="eyebrow">Что тестировать сейчас</span>
      <p style={{ fontSize: 15, marginTop: 6 }}>{focus.text}</p>
      <div className="facts2" style={{ marginTop: 12 }}>
        <div className="fact"><b>{total.sent}</b><span>написали всего</span></div>
        <div className="fact"><b>{showPct(total.opened, total.sent)}</b><span>открыли · цель 45%+</span></div>
        <div className="fact"><b>{showPct(total.replied, total.sent)}</b><span>ответили · цель 6%+</span></div>
        <div className="fact"><b>{showPct(total.registered, total.replied)}</b><span>ответивших зарегались · цель 35%+</span></div>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Правило простое: чиним первое слабое место сверху вниз. Не открывают — меняем тему. Открывают, но молчат — меняем письмо. Отвечают, но не регистрируются — меняем призыв и фоллоуапы. Одна правка за тест, иначе непонятно, что сработало.</p>
    </section>

    <section className="panel" style={{ padding: 18 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><span className="eyebrow">{running ? `Идёт тест · с ${fmt(running.started_at)}` : "Тест не идёт"}</span><h2 style={{ fontSize: 20, marginTop: 4 }}>{running?.name ?? "Работает лучшее письмо"}</h2>{running?.hypothesis && <p className="muted" style={{ marginTop: 2, fontSize: 13.5 }}>{running.hypothesis}</p>}</div>
        <span className="tag">сравниваем по: {METRIC_NAME[useMetric as keyof typeof METRIC_NAME] ?? "ответы"}{useMetric !== metric ? " (пока регистраций меньше 10)" : ""}</span>
      </div>
      <div className="tw" style={{ marginTop: 12 }}><table className="t"><thead><tr><th>Вариант</th><th className="num">Написали</th><th className="num">Открыли</th><th className="num">Ответили</th><th className="num">Регистрации</th><th>Шанс, что лучший</th></tr></thead>
        <tbody>{live.map((a) => { const st = stats[a.id]; const p = pb[a.id] ?? 0; const v = verdict(p, st.sent, 150);
          return <tr key={a.id} style={{ opacity: a.status === "active" ? 1 : 0.5 }}><td><div className="row" style={{ flexWrap: "nowrap" }}><span className="arm-l" style={{ width: 26, height: 26, fontSize: 13 }}>{a.label}</span><div><b>{a.name}</b><div className="muted" style={{ fontSize: 12 }}>«{fill(a.steps[0]?.subject ?? "", SAMPLE)}»{st.queued > st.sent ? ` · ждут отправки ${st.queued - st.sent}` : ""}</div></div></div></td>
            <td className="num">{st.sent}</td><td className="num">{showPct(st.opened, st.sent)}</td><td className="num">{showPct(st.replied, st.sent)}</td><td className="num">{st.registered} <span className="muted">{st.sent ? `(${showPct(st.registered, st.sent)})` : ""}</span></td>
            <td style={{ minWidth: 170 }}>{a.status !== "active" ? <span className="tag">на паузе</span> : !enough ? <span className="muted" style={{ fontSize: 12.5 }}>нужно 30+ писем</span> : <><div className="row" style={{ flexWrap: "nowrap" }}><div className="pbest" style={{ width: 80 }}><i style={{ width: `${p * 100}%` }} /></div><b>{Math.round(p * 100)}%</b></div>{v.text && <span className={`tag ${v.tag}`} style={{ marginTop: 4 }}>{v.text}</span>}</>}</td></tr>; })}</tbody></table></div>
      <details style={{ marginTop: 12 }}><summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13.5 }}>Посмотреть письма</summary>
        <div className="two" style={{ marginTop: 10 }}>{live.map((a) => <div key={a.id} className="flex flex-col gap-2"><div className="row"><span className="arm-l" style={{ width: 24, height: 24, fontSize: 12 }}>{a.label}</span><b>{a.name}</b></div><Preview steps={a.steps} />
          <details><summary className="muted" style={{ cursor: "pointer", fontSize: 12.5 }}>Править текст</summary><form action={saveArm} className="flex flex-col gap-2" style={{ marginTop: 8 }}><input type="hidden" name="id" value={a.id} /><input className="in" name="name" defaultValue={a.name} aria-label="Название" /><StepEditor steps={a.steps} />{stats[a.id].sent > 0 && <div className="note">Этот вариант уже отправлялся: правка смешает результаты. Новую идею лучше запустить отдельным тестом.</div>}<div className="row"><Submit className="btn-p">Сохранить</Submit></div></form>
            <form action={setArmStatus} style={{ marginTop: 6 }}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value={a.status === "active" ? "paused" : "active"} /><Submit>{a.status === "active" ? "Поставить на паузу" : "Включить"}</Submit></form></details></div>)}</div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>В примере подставлены условные имя, первая строка и ссылка. У каждого креатора они свои.</p>
      </details>
      {running && <details style={{ marginTop: 8 }}><summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 600 }}>Завершить тест вручную</summary>
        <form action={endExperiment} className="row" style={{ marginTop: 8 }}><input type="hidden" name="id" value={running.id} /><select className="in" name="winner" defaultValue={best?.id} aria-label="Победитель">{live.map((a) => <option key={a.id} value={a.id}>Победил {a.label}: {a.name}</option>)}</select><input className="in" name="result" placeholder="Что узнали" style={{ flex: 1, minWidth: 200 }} aria-label="Вывод" /><Submit className="btn-p">Завершить</Submit></form></details>}
    </section>

    <section className="panel" style={{ padding: 18 }}>
      <span className="eyebrow">Идеи для следующего теста</span>
      <p className="muted" style={{ fontSize: 13, margin: "6px 0 12px" }}>Каждая идея меняет одну вещь в текущем лучшем письме. «Запустить» завершает текущий тест (победителем станет вариант с бо́льшим шансом) и начинает новый: лучшее письмо против письма с этой правкой. Тестируй, когда в текущем тесте есть победитель или прошло ~200 писем на вариант.</p>
      <div className="grid" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
        {(["open", "reply", "registered"] as const).map((m) => <div key={m} className="panel" style={{ padding: 14, ...(focus.metric === m ? { borderColor: "var(--accent)", boxShadow: "0 0 0 2px #e3ddff" } : {}) }}>
          <div className="row" style={{ justifyContent: "space-between" }}><b style={{ fontSize: 15 }}>{METRIC_NAME[m]}</b>{focus.metric === m && <span className="tag lime">сейчас сюда</span>}</div>
          <p className="muted" style={{ fontSize: 12, margin: "2px 0 8px" }}>{m === "open" ? "Тестируем тему письма" : m === "reply" ? "Тестируем текст первого письма" : "Тестируем призыв и фоллоуапы"}</p>
          <div className="flex flex-col">{HYPOTHESES.filter((h) => h.metric === m).map((h) => <form key={h.id} action={startHypothesis} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}><input type="hidden" name="id" value={h.id} />
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start" }}><div><b style={{ fontSize: 13.5 }}>{h.title}</b>{testedIds.has(h.id) && <span className="tag" style={{ marginLeft: 6 }}>уже тестировали</span>}<div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{h.why}</div>{h.change.kind === "subject" && <div style={{ fontSize: 12.5, marginTop: 4 }}>Тема: «{fill(h.change.value, SAMPLE)}»</div>}</div><Submit>Запустить</Submit></div></form>)}
            {m === "open" && <div style={{ paddingTop: 10, borderTop: "1px solid var(--line)" }}><form action={suggestSubjects}><Submit>{s.subject_ideas.length ? "Ещё темы от AI" : "Придумать темы с AI"}</Submit></form>
              {s.subject_ideas.map((t) => <form key={t} action={armFromIdea} className="row" style={{ padding: "6px 0", justifyContent: "space-between", flexWrap: "nowrap" }}><input type="hidden" name="subject" value={t} /><span style={{ fontSize: 13 }}>«{t}»</span><Submit>Запустить</Submit></form>)}</div>}
          </div></div>)}
      </div>
    </section>

    <details className="panel set"><summary>Свой вариант письма</summary>
      <p className="muted" style={{ fontSize: 13, margin: "6px 0 10px" }}>Добавится третьим вариантом в текущий тест.</p>
      <form action={saveArm} className="flex flex-col gap-2"><input className="in" name="name" placeholder="Что меняем (название)" required aria-label="Название" /><StepEditor steps={best?.steps ?? STARTER[0].steps} /><div className="row"><Submit className="btn-p">Добавить</Submit></div></form></details>

    <details className="panel set"><summary>Старые кампании в Instantly</summary>
      <div className="row" style={{ justifyContent: "space-between", margin: "6px 0 10px" }}><p className="muted" style={{ fontSize: 13 }}>То, что вы отправляли до тулы: базовая линия. Проценты от тех, кому письмо реально ушло, каждый креатор один раз, без автоответов.</p><form action={refreshSnapshot}><Submit>Обновить</Submit></form></div>
      {snap?.campaigns.length ? <div className="tw"><table className="t"><thead><tr><th>Кампания</th><th>Тема</th><th className="num">Получили</th><th className="num">Открыли</th><th className="num">Ответили</th><th></th></tr></thead><tbody>{snap.campaigns.filter((c) => !c.name.startsWith("Creators · ") && !/^sales/i.test(c.name) && !/companyName/i.test(c.steps[0]?.subject ?? "")).map((c) => <tr key={c.id}><td>{c.name}</td><td className="muted">{c.steps[0]?.subject || "—"}</td><td className="num">{c.leads}</td><td className="num">{c.sent && !c.opened ? <span className="muted">не считались</span> : showPct(c.opened, c.leads)}</td><td className="num">{showPct(c.replied, c.leads)}</td><td><form action={armFromOld}><input type="hidden" name="id" value={c.id} /><Submit>Забрать текст</Submit></form></td></tr>)}</tbody></table></div> : <p className="muted">Ещё не прочитаны: «Подключить всё» в Настройках.</p>}
    </details>

    {done.length > 0 && <details className="panel set"><summary>Завершённые тесты ({done.length})</summary>{done.map((e) => <div key={e.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}><b>{e.name}</b> <span className="muted">· {fmt(e.started_at)} — {fmt(e.ended_at)}</span><div className="muted" style={{ fontSize: 13 }}>{e.result || "Без вывода"}{e.winner_arm ? ` · победил: ${arms.find((a) => a.id === e.winner_arm)?.name ?? "—"}` : ""}</div></div>)}</details>}
  </div>;
}
