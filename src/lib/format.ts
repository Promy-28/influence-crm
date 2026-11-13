export const fmt = (d?: string | null) => { if (!d) return "—"; const x = new Date(d); return x.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Warsaw" }); };
export const fmtTime = (d?: string | null) => (d ? new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }) : "—");
export const pct = (a: number, b: number) => (b ? (100 * a) / b : null);
export const showPct = (a: number, b: number, digits = 1) => { const p = pct(a, b); return p === null ? "—" : p === 0 ? "0%" : `${p.toFixed(p < 10 && digits ? digits : 0)}%`; };
export const n = (v?: number | null) => (v === null || v === undefined ? "—" : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}K` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(v));
export function ago(d?: string | null) {
  if (!d) return "—"; const h = (Date.now() - new Date(d).getTime()) / 36e5;
  if (h < 1 / 60) return "только что"; if (h < 1) return `${Math.floor(h * 60)} мин назад`; if (h < 24) return `${Math.floor(h)} ч назад`; const days = Math.floor(h / 24); return days === 1 ? "вчера" : days < 30 ? `${days} дн назад` : fmt(d);
}
export const todayWarsaw = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
// Period filter shared by the dashboards.
export function range(sp: { period?: string; from?: string; to?: string }) {
  const p = sp.period ?? "30"; const now = new Date(); const day = (d: Date) => d.toISOString().slice(0, 10);
  if (p === "all") return { from: "2020-01-01", to: day(new Date(now.getTime() + 864e5)), label: "всё время" };
  if (p === "custom" && sp.from) return { from: sp.from, to: sp.to || day(now), label: `${sp.from} — ${sp.to || "сегодня"}` };
  const days = p === "7" ? 7 : p === "today" ? 1 : p === "90" ? 90 : 30;
  return { from: day(new Date(now.getTime() - (days - 1) * 864e5)), to: day(new Date(now.getTime() + 864e5)), label: p === "today" ? "сегодня" : `${days} дней` };
}
export const PLATFORM: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram" };
type St = { review_status?: string | null; queued_at?: string | null; first_sent_at?: string | null; opened_at?: string | null; replied_at?: string | null; positive_at?: string | null; registered_at?: string | null; profile_done_at?: string | null; first_video_at?: string | null; do_not_contact?: boolean | null; bounced_at?: string | null; unsubscribed_at?: string | null };
// The furthest step a creator reached, for lists and filters.
export function stage(c: St): [string, string] {
  if (c.first_video_at) return ["Прислал видео", "lime"];
  if (c.profile_done_at) return ["Профиль заполнен", "good"];
  if (c.registered_at) return ["Зарегистрирован", "good"];
  if (c.bounced_at) return ["Почта не работает", "bad"];
  if (c.unsubscribed_at) return ["Отписался", "bad"];
  if (c.review_status === "existing") return ["Из старой таблицы", ""];
  if (c.positive_at) return ["Интерес", "good"];
  if (c.replied_at) return ["Ответил", "warn"];
  if (c.do_not_contact && !c.first_sent_at) return ["Не писать", "bad"];
  if (c.opened_at) return ["Открыл", ""];
  if (c.first_sent_at) return ["Написали", ""];
  if (c.queued_at) return ["В очереди Instantly", ""];
  if (c.review_status === "approved") return ["Одобрен", ""];
  if (c.review_status === "pending") return ["На проверке", ""];
  return ["Отклонён", "bad"];
}
export const STAGE_FILTERS: [string, string][] = [["", "Все"], ["video", "Прислали видео"], ["profile", "Заполнили профиль"], ["registered", "Зарегистрированы"], ["positive", "С интересом"], ["replied", "Ответили"], ["sent", "Написали"], ["queued", "В очереди"], ["approved", "Одобрены, не отправлены"], ["pending", "На проверке"], ["rejected", "Отклонены"], ["existing", "Из старых таблиц"]];
