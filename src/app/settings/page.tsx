import { getSettings, dailyNew, type Key, type Settings } from "@/lib/settings";
import { listAccounts, type Mailbox } from "@/lib/instantly";
import { db } from "@/lib/db";
import { LABELS } from "@/lib/replies";
import { fmtTime } from "@/lib/format";
import { Submit } from "@/components/ui";
import { connectAll, runTick, saveSettings, senderName, tgFind, tgTest } from "@/lib/actions";

const Keys = ({ k }: { k: Key[] }) => <>{k.map((x) => <input key={x} type="hidden" name="_keys" value={x} />)}</>;
function Num({ s, k, label, hint, step }: { s: Settings; k: Key; label: string; hint?: string; step?: string }) { return <label className="field">{label}<input className="in" name={k} type="number" step={step ?? "1"} defaultValue={String(s[k])} />{hint && <span>{hint}</span>}</label>; }
function Txt({ s, k, label, hint, type = "text" }: { s: Settings; k: Key; label: string; hint?: string; type?: string }) { return <label className="field">{label}<input className="in" name={k} type={type} defaultValue={String(s[k] ?? "")} />{hint && <span>{hint}</span>}</label>; }
function Chk({ s, k, label }: { s: Settings; k: Key; label: string }) { return <label className="check-row"><input type="checkbox" name={k} defaultChecked={!!s[k]} />{label}</label>; }

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; tgchats?: string }> }) {
  const sp = await searchParams; const s = await getSettings();
  let boxes: Mailbox[] = []; let boxErr = "";
  if (s.instantly_key) boxes = await listAccounts().catch((e) => { boxErr = String(e).slice(0, 160); return []; });
  const { data: names } = await db.from("settings").select("key,value").like("key", "sender_name:%");
  const nameOf = Object.fromEntries((names ?? []).map((r) => [r.key.slice(12), r.value as string]));
  const masked = (v: string) => (v ? `введён ••••${v.slice(-4)}` : "не введён");
  const okTick = s.last_tick_at && Date.now() - new Date(s.last_tick_at).getTime() < 20 * 6e4;
  return <div className="flex flex-col gap-4" style={{ maxWidth: 1000 }}>
    <div><h1>Настройки</h1><p className="sub">Порядок запуска: ключи → «Подключить всё» → выбрать ящики и дату старта → проверить первых креаторов в «Проверке».</p></div>
    {sp.msg && <div className="okbox">{sp.msg}</div>}

    <section className="panel" style={{ padding: 18 }}><h2>Состояние</h2>
      <div className="facts2" style={{ marginTop: 10 }}>
        <div className="fact"><b>{s.apify_key && s.openai_key && s.instantly_key ? "✓" : "—"}</b><span>ключи Apify, OpenAI, Instantly</span></div>
        <div className="fact"><b>{s.cron_url ? "✓" : "—"}</b><span>автозапуск записан</span></div>
        <div className="fact"><b>{okTick ? "✓" : "—"}</b><span>{s.last_tick_at ? `последний запуск ${fmtTime(s.last_tick_at)}` : "автоматика не запускалась"}</span></div>
        <div className="fact"><b>{s.senders.length}</b><span>ящиков для отправки</span></div>
        <div className="fact"><b>{dailyNew(s)}</b><span>новых креаторов в день</span></div>
        <div className="fact"><b>{s.send_start || "—"}</b><span>старт отправки</span></div>
      </div>
      <div className="row" style={{ marginTop: 12 }}><form action={connectAll}><Submit className="btn-p">Подключить всё</Submit></form><form action={runTick}><Submit>Запустить автоматику сейчас</Submit></form></div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>«Подключить всё» записывает адрес автозапуска для pg_cron, находит ящики trypromy.co, ставит им лимит, подключает вебхук Instantly и читает старые кампании. Повторять можно сколько угодно.</p></section>

    <details className="panel set" open={!s.apify_key || !s.openai_key || !s.instantly_key}><summary>Ключи</summary>
      <form action={saveSettings} className="form-grid"><Keys k={["apify_key", "openai_key", "instantly_key"]} />
        <label className="field">Apify API token<input className="in" name="apify_key" type="password" placeholder={masked(s.apify_key)} autoComplete="off" /><span>console.apify.com → Settings → Integrations</span></label>
        <label className="field">OpenAI API key<input className="in" name="openai_key" type="password" placeholder={masked(s.openai_key)} autoComplete="off" /></label>
        <label className="field">Instantly API key (v2)<input className="in" name="instantly_key" type="password" placeholder={masked(s.instantly_key)} autoComplete="off" /><span>Instantly → Settings → Integrations → API, права all:all</span></label>
        <div style={{ alignSelf: "end" }}><Submit className="btn-p">Сохранить ключи</Submit></div></form></details>

    <details className="panel set" open={!s.senders.length || !s.send_start}><summary>Отправка</summary>
      <form action={saveSettings} className="flex flex-col gap-3" style={{ marginTop: 12 }}><Keys k={["senders", "mailbox_daily", "emails_per_lead", "daily_new_override", "send_start", "schedule_tz", "schedule_from", "schedule_to", "send_weekends", "open_tracking", "signup_url", "min_arm_share", "bounce_pause_pct"]} />
        <div><b style={{ fontSize: 13 }}>С каких ящиков писать</b>{boxErr && <div className="errbox">{boxErr}</div>}
          <div className="flex flex-col gap-1" style={{ marginTop: 6 }}>{boxes.map((b) => <label key={b.email} className="check-row"><input type="checkbox" name="senders" value={b.email} defaultChecked={s.senders.includes(b.email)} />{b.email} <span className="muted">прогрев {b.stat_warmup_score ?? "?"}</span></label>)}
            {!boxes.length && s.senders.map((e) => <label key={e} className="check-row"><input type="checkbox" name="senders" value={e} defaultChecked />{e}</label>)}
            {!boxes.length && !s.senders.length && <span className="muted">Введи ключ Instantly, и здесь появятся ящики.</span>}</div></div>
        <div className="form-grid" style={{ marginTop: 0 }}>
          <Txt s={s} k="send_start" label="Старт отправки" type="date" hint="До этой даты лиды в Instantly не уходят. Сначала проверь первых креаторов." />
          <Num s={s} k="mailbox_daily" label="Писем в день с ящика" hint="С учётом фоллоуапов. У вас 30." />
          <Num s={s} k="emails_per_lead" label="Писем на креатора в среднем" step="0.1" hint="Для расчёта новых в день: 3 шага минус ответившие ≈ 2.6" />
          <Num s={s} k="daily_new_override" label="Новых креаторов в день вручную" hint={`0 = считать сама. Сейчас ${dailyNew(s)}.`} />
          <Txt s={s} k="schedule_tz" label="Часовой пояс отправки" hint="America/Chicago, America/New_York" />
          <Txt s={s} k="schedule_from" label="Отправлять с" type="time" /><Txt s={s} k="schedule_to" label="до" type="time" />
          <Txt s={s} k="signup_url" label="Ссылка на регистрацию" hint="{code} заменится на личный код креатора" />
          <Num s={s} k="min_arm_share" label="Минимальная доля варианта в тесте" step="0.05" hint="0.2 = каждый вариант получает не меньше 20%" />
          <Num s={s} k="bounce_pause_pct" label="Пауза ящика при баунсах, %" />
        </div>
        <div className="row" style={{ gap: 18 }}><Chk s={s} k="send_weekends" label="Отправлять в выходные" /><Chk s={s} k="open_tracking" label="Считать открытия (пиксель)" /></div>
        <div><Submit className="btn-p">Сохранить</Submit></div></form>
      {s.senders.length > 0 && <div style={{ marginTop: 14 }}><b style={{ fontSize: 13 }}>Имя в подписи ответов</b><p className="muted" style={{ fontSize: 12.5 }}>Как подписываются AI-ответы с каждого ящика. В цепочке Instantly подставляет имя ящика сам.</p>
        {s.senders.map((e) => <form key={e} action={senderName} className="row" style={{ marginTop: 6 }}><input type="hidden" name="email" value={e} /><span style={{ width: 240 }}>{e}</span><input className="in" name="name" defaultValue={nameOf[e] ?? ""} placeholder={e.split("@")[0]} aria-label="Имя" /><Submit>Сохранить</Submit></form>)}</div>}
    </details>

    <details className="panel set"><summary>Поиск и фильтры</summary>
      <form action={saveSettings} className="flex flex-col gap-3" style={{ marginTop: 12 }}><Keys k={["search_mode", "search_weekday", "platforms", "require_ugc_in_bio", "fresh_days", "max_followers", "min_followers", "us_only", "english_only", "auto_approve", "auto_approve_score", "auto_reject_score", "review_buffer_days", "results_per_query", "queries_per_run", "profile_batch", "apify_month_budget", "tiktok_actor", "ig_discover_actor", "ig_profile_actor"]} />
        <div className="form-grid" style={{ marginTop: 0 }}>
          <label className="field">Когда искать<select className="in" name="search_mode" defaultValue={s.search_mode}><option value="weekly">Раз в неделю, на всю неделю отправки</option><option value="auto">Автоматически, когда запас кончается</option><option value="off">Только вручную</option></select><span>Раз в неделю: в выбранный день тула ищет, пока не наберёт креаторов на неделю писем.</span></label>
          <label className="field">День поиска<select className="in" name="search_weekday" defaultValue={String(s.search_weekday)}>{["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"].map((d, i) => <option key={i} value={i}>{d}</option>)}</select></label>
        </div>
        <div className="row" style={{ gap: 18 }}><label className="check-row"><input type="checkbox" name="platforms" value="tiktok" defaultChecked={s.platforms.includes("tiktok")} />TikTok</label><label className="check-row"><input type="checkbox" name="platforms" value="instagram" defaultChecked={s.platforms.includes("instagram")} />Instagram</label></div>
        <div className="row" style={{ gap: 18 }}><Chk s={s} k="require_ugc_in_bio" label="Обязательно UGC в описании" /><Chk s={s} k="us_only" label="Только США" /><Chk s={s} k="english_only" label="Только английский" /></div>
        <div className="form-grid" style={{ marginTop: 0 }}>
          <Num s={s} k="fresh_days" label="Постил не позже, дней" hint="Живой аккаунт = живая почта" />
          <Num s={s} k="max_followers" label="Максимум подписчиков" hint="Больше = скорее инфлюенсер. 0 = без лимита" />
          <Num s={s} k="min_followers" label="Минимум подписчиков" />
          <Num s={s} k="auto_reject_score" label="AI отсеивает при оценке до" />
          <Num s={s} k="auto_approve_score" label="Автоодобрение при оценке от" />
          <Num s={s} k="review_buffer_days" label="Держать запас креаторов, дней" />
          <Num s={s} k="results_per_query" label="Результатов на запрос" />
          <Num s={s} k="queries_per_run" label="Запросов за один поиск" />
          <Num s={s} k="profile_batch" label="Профилей за одну проверку" />
          <Num s={s} k="apify_month_budget" label="Бюджет Apify в месяц, $" />
          <Txt s={s} k="tiktok_actor" label="Apify actor TikTok" /><Txt s={s} k="ig_discover_actor" label="Apify actor IG поиск" /><Txt s={s} k="ig_profile_actor" label="Apify actor IG профили" />
        </div>
        <Chk s={s} k="auto_approve" label="Автоодобрение: креаторы с высокой оценкой AI уходят в рассылку без проверки (включай, когда точность AI в Проверке ≥ 90%)" />
        <div><Submit className="btn-p">Сохранить</Submit></div></form></details>

    <details className="panel set" id="tg" open={!!sp.tgchats || !s.tg_chat}><summary>Уведомления в Telegram</summary>
      <p className="muted" style={{ fontSize: 13, margin: "6px 0 10px" }}>Сюда тула пишет, только когда нужен человек: креатор злится, торгуется, хочет созвон, спрашивает то, чего AI не знает, или автопилот не уверен. Плюс сводка за день в 18:00 и тревоги (ящик на паузе, кончается бюджет Apify). Всё остальное автопилот делает сам.</p>
      <ol className="muted" style={{ fontSize: 13, paddingLeft: 18, margin: "0 0 10px" }}><li>Создай бота в @BotFather (или возьми бота сейлз-тулы) и скопируй токен.</li><li>Добавь бота в чат, куда слать уведомления, и напиши там любое сообщение.</li><li>Вставь токен и нажми «Найти чат» (или впиши ID чата вручную).</li></ol>
      <form action={saveSettings} className="form-grid" style={{ marginTop: 0 }}><Keys k={["tg_token", "tg_chat"]} /><input type="hidden" name="back" value="/settings#tg" />
        <label className="field">Токен бота<input className="in" name="tg_token" type="password" placeholder={masked(s.tg_token)} autoComplete="off" /></label>
        <label className="field">ID чата<input className="in" name="tg_chat" defaultValue={s.tg_chat} placeholder="-100…" /></label>
        <div className="row" style={{ alignSelf: "end" }}><Submit className="btn-p">Сохранить</Submit><Submit formAction={tgFind}>Найти чат</Submit>{s.tg_token && s.tg_chat && <Submit formAction={tgTest}>Тест</Submit>}</div></form>
      {sp.tgchats && (() => { const chats = JSON.parse(sp.tgchats) as { id: string; title: string }[]; return chats.length ? <div className="flex flex-col gap-1" style={{ marginTop: 10 }}><b style={{ fontSize: 13 }}>Чаты, где бот видел сообщения:</b>{chats.map((c) => <form key={c.id} action={saveSettings} className="row"><Keys k={["tg_chat"]} /><input type="hidden" name="back" value="/settings#tg" /><input type="hidden" name="tg_chat" value={c.id} /><span style={{ width: 280 }}>{c.title} <span className="muted">({c.id})</span></span><Submit>Выбрать</Submit></form>)}</div> : <div className="note" style={{ marginTop: 10 }}>Бот пока не видел сообщений. Добавь его в чат, напиши там что-нибудь и нажми «Найти чат» ещё раз.</div>; })()}
    </details>

    <details className="panel set"><summary>Ответы и AI</summary>
      <form action={saveSettings} className="flex flex-col gap-3" style={{ marginTop: 12 }}><Keys k={["autopilot", "autopilot_labels", "autopilot_min_conf", "autopilot_delay_min", "call_link", "kb", "model_fast", "model_write"]} />
        <Chk s={s} k="autopilot" label="Автопилот: AI отвечает сам, а человека зовёт в Telegram только в сложных случаях" />
        <div><b style={{ fontSize: 13 }}>На какие метки</b><div className="row" style={{ marginTop: 6 }}>{Object.entries(LABELS).filter(([, v]) => !v.noReply).map(([k, v]) => <label key={k} className="check-row"><input type="checkbox" name="autopilot_labels" value={k} defaultChecked={s.autopilot_labels.includes(k)} />{v.name}</label>)}</div></div>
        <div className="form-grid" style={{ marginTop: 0 }}>
          <Num s={s} k="autopilot_min_conf" label="Минимальная уверенность AI" step="0.05" />
          <Num s={s} k="autopilot_delay_min" label="Задержка перед отправкой, мин" hint="Успеешь поправить или отменить" />
          <Txt s={s} k="call_link" label="Ссылка для созвона (Calendly)" hint="Пусто: AI спросит удобное время" />
          <Txt s={s} k="model_fast" label="Модель для оценки" /><Txt s={s} k="model_write" label="Модель для ответов" />
        </div>
        <label className="field">Что AI знает о Promy (факты для ответов)<textarea className="in" name="kb" rows={14} defaultValue={s.kb} /><span>AI не выходит за эти факты. Поменялись условия — поправь здесь.</span></label>
        <div><Submit className="btn-p">Сохранить</Submit></div></form></details>
  </div>;
}
