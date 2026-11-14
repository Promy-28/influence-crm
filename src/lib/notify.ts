import "server-only";
import { getSettings, setSetting } from "./settings";
import { baseUrl } from "./apify";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// One Telegram message to the team chat. Silent no-op until a bot and chat are set in Settings.
export async function ping(html: string) {
  const s = await getSettings();
  if (!s.tg_token || !s.tg_chat) return false;
  const r = await fetch(`https://api.telegram.org/bot${s.tg_token}/sendMessage`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: s.tg_chat, text: html, parse_mode: "HTML", disable_web_page_preview: true }), signal: AbortSignal.timeout(10000) }).catch(() => null);
  return !!r?.ok;
}

export async function pingHuman(c: { id: string; handle: string }, reason: string, said: string) {
  return ping(`🔔 <b>Нужен человек</b>: @${esc(c.handle)}\n${esc(reason)}\n\n<i>«${esc(said.slice(0, 300))}»</i>\n\n<a href="${baseUrl()}/inbox?c=${c.id}">Открыть диалог</a>`);
}

export async function pingEvent(title: string, text: string) { return ping(`⚠️ <b>${esc(title)}</b>\n${esc(text)}`); }

export async function findChats(token: string) {
  const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description ?? `Telegram ${r.status}`);
  const chats = new Map<string, string>();
  for (const u of j.result ?? []) { const ch = u.message?.chat ?? u.my_chat_member?.chat ?? u.channel_post?.chat; if (ch) chats.set(String(ch.id), ch.title ?? ch.username ?? ch.first_name ?? String(ch.id)); }
  return [...chats.entries()].map(([id, title]) => ({ id, title }));
}

// Once a day: what happened, so nobody has to watch the tool.
export async function digest(stats: { sent: number; replies: number; auto: number; human: number; registered: number; profiles: number; approvedReady: number }) {
  return ping(`📊 <b>Креаторы за сутки</b>\nНаписали: ${stats.sent}\nОтветили: ${stats.replies} (автопилот ответил ${stats.auto})\nЗарегистрировались: ${stats.registered}, заполнили профиль: ${stats.profiles}\nЖдут человека: ${stats.human}\nВ запасе на отправку: ${stats.approvedReady}\n\n<a href="${baseUrl()}/">Дашборд</a>`);
}
export { setSetting };
