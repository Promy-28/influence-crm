// Email copy and the test library. Pure, so it is tested.
// Variables: {{firstName}} {{line}} {{ref_link}} {{handle}} {{platform}} come from the tool; {{sendingAccountFirstName}} is Instantly's sender name.
// Copy rules: only true facts about Promy, no invented brands, rates or open briefs; no em dashes; short lines that read well on a phone.
export type Step = { subject: string; body: string; delay_days: number };

const sig = "{{sendingAccountFirstName}}\nPromy";

// Follow-ups shared by every starter: a short bump with the link, then a polite last note.
const FU1: Step = { subject: "", delay_days: 3, body: `{{firstName}}, bumping this in case it got buried.\n\nShort version: US apps pay creators like you to film on-camera videos. You film, the brand approves, you get paid. Nothing gets posted on your page.\n\nYour profile takes about 3 minutes:\n{{ref_link}}\n\n${sig}` };
const FU2: Step = { subject: "", delay_days: 4, body: `Last note from me, {{firstName}}.\n\nIf app videos aren't your thing right now, all good, I won't follow up again.\n\nIf they are, here's your link:\n{{ref_link}}\n\n${sig}` };

export const STARTER: { label: string; name: string; steps: Step[] }[] = [
  {
    label: "A", name: "Ссылка сразу",
    steps: [{ subject: "{{firstName}}, paid ugc for apps", delay_days: 0, body: `Hey {{firstName}},\n\n{{line}}\n\nUS app brands on Promy order on-camera UGC every week, and your style fits what they ask for.\n\nHow it works:\n- the brand sets the price per video\n- you get paid as soon as they approve it\n- nothing is posted on your page\n- no cap on how many you make\n\nYour creator profile takes about 3 minutes:\n{{ref_link}}\n\n${sig}` }, FU1, FU2],
  },
  {
    label: "B", name: "Сначала вопрос, ссылка после ответа",
    steps: [{ subject: "taking new ugc work?", delay_days: 0, body: `Hey {{firstName}},\n\n{{line}}\n\nAre you taking on new UGC work right now?\n\nI'm {{sendingAccountFirstName}} from Promy. We match creators with US apps that need on-camera videos every week. Brands set the rate per video, you get paid as soon as a video is approved, and your own page stays yours.\n\nIf you're open to it, just reply "yes" and I'll send the details.\n\n${sig}` }, FU1, FU2],
  },
];

export const VARS = ["firstName", "line", "ref_link", "handle", "platform", "sendingAccountFirstName"];
export function unknownVars(t: string) { return [...t.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).filter((v) => !VARS.includes(v)); }

// ---- Test library ----
// Each hypothesis changes one thing in the current best email, so a win says exactly what worked.
export type Change =
  | { kind: "subject"; value: string }
  | { kind: "body"; step: number; value: string }
  | { kind: "drop"; step: number }
  | { kind: "ps"; value: string };
export type Hypothesis = { id: string; metric: "open" | "reply" | "registered"; title: string; why: string; change: Change };

export const HYPOTHESES: Hypothesis[] = [
  // Opens: only the subject line (and sender name) decides whether the email is opened.
  { id: "o_name", metric: "open", title: "Имя в теме", why: "Своё имя в теме бросается в глаза в списке писем. Проверяем, даёт ли оно больше открытий, чем тема без имени.", change: { kind: "subject", value: "paid ugc for apps" } },
  { id: "o_question", metric: "open", title: "Тема-вопрос", why: "Вопрос в теме хочется открыть, чтобы ответить. Короткий и без продажи.", change: { kind: "subject", value: "taking new ugc clients?" } },
  { id: "o_platform", metric: "open", title: "«Видел твой TikTok»", why: "Тема про их собственный аккаунт выглядит как личное письмо, а не рассылка. Это правда: мы нашли их там.", change: { kind: "subject", value: "saw your {{platform}}, {{firstName}}" } },
  { id: "o_money", metric: "open", title: "Деньги и выгода в теме", why: "UGC-креаторов в первую очередь интересует оплата. Прямая выгода в теме может перебить любопытство.", change: { kind: "subject", value: "paid per video, nothing posted on your page" } },
  { id: "o_short", metric: "open", title: "Два слова, как от знакомого", why: "Очень короткие темы в нижнем регистре похожи на письмо от человека, а не от бренда.", change: { kind: "subject", value: "quick question" } },
  // Replies: the email itself (length, first line, what we lead with).
  { id: "r_short", metric: "reply", title: "Письмо в 2 раза короче", why: "На телефоне длинное письмо пролистывают. Проверяем, отвечают ли чаще на 40–50 слов.", change: { kind: "body", step: 0, value: `Hey {{firstName}},\n\n{{line}}\n\nUS apps on Promy pay creators per video for on-camera UGC. You film, they approve, you get paid. Nothing goes on your page.\n\nWant the details?\n\n${sig}` } },
  { id: "r_nopage", metric: "reply", title: "Главный аргумент: ничего не постится к тебе", why: "Многие креаторы не хотят засорять свою страницу рекламой. Ставим это в начало письма, а не в конец.", change: { kind: "body", step: 0, value: `Hey {{firstName}},\n\n{{line}}\n\nWhat if brand deals never touched your own page?\n\nOn Promy, US apps pay creators per video for on-camera UGC. You film and send it, the brand approves, you get paid. The videos run on the brand's accounts, not yours.\n\nWant me to send the details?\n\n${sig}` } },
  { id: "r_proof", metric: "reply", title: "Соцдоказательство: 500+ креаторов", why: "Незнакомой платформе доверяют меньше. Цифра «500+ креаторов уже на Promy» снимает вопрос «это вообще настоящее?».", change: { kind: "body", step: 0, value: `Hey {{firstName}},\n\n{{line}}\n\n500+ UGC creators already film for US apps through Promy, and I think you'd fit right in.\n\nThe brand sets the price per video, you get paid as soon as they approve it, and nothing is posted on your page.\n\nOpen to it? Reply "yes" and I'll send the details.\n\n${sig}` } },
  { id: "r_noline", metric: "reply", title: "Без личной строки от AI", why: "Проверяем, правда ли личная первая строка помогает, или без неё выходит то же самое. Если одинаково, письмо можно упростить.", change: { kind: "body", step: 0, value: `Hey {{firstName}},\n\nUS app brands on Promy order on-camera UGC every week, and your style fits what they ask for.\n\nHow it works:\n- the brand sets the price per video\n- you get paid as soon as they approve it\n- nothing is posted on your page\n- no cap on how many you make\n\nYour creator profile takes about 3 minutes:\n{{ref_link}}\n\n${sig}` } },
  // Registrations: the call to action and how we lead them there.
  { id: "g_softcta", metric: "registered", title: "Мягкий призыв: «посмотри, как это работает»", why: "«Создай профиль» звучит как обязательство. «Посмотри» — это просто клик, а после него проще остаться.", change: { kind: "body", step: 0, value: `Hey {{firstName}},\n\n{{line}}\n\nUS app brands on Promy order on-camera UGC every week, and your style fits what they ask for.\n\nThe brand sets the price per video, you get paid as soon as they approve it, and nothing is posted on your page.\n\nHere's how it works for creators:\n{{ref_link}}\n\n${sig}` } },
  { id: "g_steps", metric: "registered", title: "Фоллоуап с пошаговым планом", why: "Неясно, что будет после регистрации, поэтому не регистрируются. Расписываем 3 шага до первой оплаты.", change: { kind: "body", step: 1, value: `{{firstName}}, here's exactly how it goes:\n\n1. Make your creator profile (about 3 minutes): {{ref_link}}\n2. A brand picks you and sends a brief\n3. You film one test video, they approve it, you get paid\n\nAfter that, brands usually order more.\n\n${sig}` } },
  { id: "g_two", metric: "registered", title: "2 письма вместо 3", why: "Третье письмо съедает треть ящика. Если без него регистраций столько же, на ящик помещается больше новых креаторов.", change: { kind: "drop", step: 2 } },
  { id: "g_ps", metric: "registered", title: "P.S. про ревизии", why: "Креаторы боятся снять и не получить денег. P.S. «если что-то не так, бренд просит правку, а не отказывает» снимает этот страх.", change: { kind: "ps", value: "P.S. If a brand wants changes, they ask for a revision. Videos don't just get rejected." } },
];

// The challenger email: the current best email with exactly one change.
export function applyChange(base: Step[], c: Change): Step[] {
  const s = base.map((x) => ({ ...x }));
  if (c.kind === "subject") s[0].subject = c.value;
  else if (c.kind === "body") { if (s[c.step]) s[c.step].body = c.value; }
  else if (c.kind === "drop") s.splice(c.step, 1);
  else if (c.kind === "ps") s[0].body = s[0].body.replace(/\n\n\{\{sendingAccountFirstName\}\}\nPromy\s*$/, `\n\n${sig}\n\n${c.value}`);
  return s;
}

export const METRIC_NAME = { open: "Открытия", reply: "Ответы", registered: "Регистрации" } as const;
// What to test now, from where the funnel leaks. Rates are 0..1; null when there is too little data.
export function nextFocus(sent: number, open: number | null, reply: number | null, regPerReply: number | null): { metric: "open" | "reply" | "registered" | null; text: string } {
  if (sent < 150) return { metric: null, text: `Пока мало данных: написали ${sent}, нужно хотя бы 150. Первый тест уже идёт, вердикт будет после ~200 писем на вариант.` };
  if (open !== null && open < 0.45) return { metric: "open", text: `Открывают ${Math.round(open * 100)}%, это ниже 45%. Письма не видят, поэтому сначала тестируем темы. Если и это не поможет, проверь ящики: возможно, письма падают в спам.` };
  if (reply !== null && reply < 0.06) return { metric: "reply", text: `Открывают нормально, но отвечают только ${(reply * 100).toFixed(1)}% (цель 6%+). Тестируем сам текст письма.` };
  if (regPerReply !== null && regPerReply < 0.35) return { metric: "registered", text: `Отвечают хорошо, но регистрируются только ${Math.round(regPerReply * 100)}% ответивших (цель 35%+). Тестируем призыв к действию и фоллоуапы.` };
  return { metric: "registered", text: "Воронка в норме. Дальше растим регистрации: следующий тест на призыв к действию." };
}
