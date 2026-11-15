// Turns raw Apify items into one shape and applies the hard filters. Pure, so it is tested.
import { bioCountry, daysAgo, extractEmails, handleKey, INFLUENCER_RE, mentionsUgc, profileUrl } from "./text.ts";

export type Post = { url: string; media_url?: string | null; cover?: string | null; caption?: string | null; at?: string | null; views?: number | null; lang?: string | null };
export type Profile = {
  platform: "tiktok" | "instagram"; handle: string; name?: string | null; bio?: string | null;
  followers?: number | null; following?: number | null; likes?: number | null; posts_count?: number | null;
  verified?: boolean | null; private?: boolean | null; avatar?: string | null; bio_link?: string | null; region?: string | null;
  business_email?: string | null; posts: Post[];
};
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// TikTok scraper rows are videos with the author attached; group them per author.
export function tiktokProfiles(items: Any[]): Profile[] {
  const by = new Map<string, Profile>();
  for (const it of items) {
    const a = it.authorMeta ?? it.author ?? null; if (!a?.name && !a?.uniqueId) continue;
    const handle = handleKey(String(a.name ?? a.uniqueId));
    const p = by.get(handle) ?? { platform: "tiktok" as const, handle, name: a.nickName ?? a.nickname ?? null, bio: a.signature ?? null, followers: num(a.fans ?? a.followers), following: num(a.following), likes: num(a.heart ?? a.likes), posts_count: num(a.video), verified: !!a.verified, private: !!a.privateAccount, avatar: a.avatar ?? a.originalAvatarUrl ?? null, bio_link: a.bioLink ?? null, region: a.region ?? null, posts: [] as Post[] };
    if (it.webVideoUrl || it.id) p.posts.push({ url: it.webVideoUrl ?? `https://www.tiktok.com/@${handle}/video/${it.id}`, media_url: [it.videoMeta?.playAddr, it.videoMeta?.downloadAddr, it.videoUrl].find(v => typeof v === "string" && v.startsWith("https://")) ?? null, cover: it.videoMeta?.coverUrl ?? it.covers?.default ?? null, caption: it.text ?? null, at: it.createTimeISO ?? (it.createTime ? new Date(it.createTime * 1000).toISOString() : null), views: num(it.playCount), lang: it.textLanguage ?? null });
    by.set(handle, p);
  }
  for (const p of by.values()) p.posts.sort((x, y) => (y.at ?? "").localeCompare(x.at ?? ""));
  return [...by.values()];
}

// Instagram hashtag rows only name the owner; the profile scraper gives the bio and latest posts.
export function igOwners(items: Any[]): { handle: string; caption?: string }[] {
  const seen = new Map<string, { handle: string; caption?: string }>();
  for (const it of items) { const h = it.ownerUsername ?? it.owner?.username; if (h && !seen.has(h)) seen.set(handleKey(h), { handle: handleKey(h), caption: it.caption }); }
  return [...seen.values()];
}

export function igProfiles(items: Any[]): Profile[] {
  return items.filter((it) => it.username && !it.error).map((it) => ({
    platform: "instagram" as const, handle: handleKey(it.username), name: it.fullName ?? null, bio: it.biography ?? null,
    followers: num(it.followersCount), following: num(it.followsCount), likes: null, posts_count: num(it.postsCount),
    verified: !!it.verified, private: !!it.private, avatar: it.profilePicUrlHD ?? it.profilePicUrl ?? null,
    bio_link: it.externalUrl ?? it.externalUrls?.[0]?.url ?? null, region: null,
    business_email: it.businessEmail ?? it.publicEmail ?? it.public_email ?? null,
    posts: (it.latestPosts ?? []).map((x: Any) => ({ url: x.url ?? (x.shortCode ? `https://www.instagram.com/p/${x.shortCode}/` : ""), media_url: typeof x.videoUrl === "string" ? x.videoUrl : null, cover: x.displayUrl ?? null, caption: x.caption ?? null, at: x.timestamp ?? null, views: num(x.videoViewCount ?? x.videoPlayCount) })).sort((x: Post, y: Post) => (y.at ?? "").localeCompare(x.at ?? "")),
  }));
}

const num = (v: unknown) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));

export type Rules = { require_ugc_in_bio: boolean; fresh_days: number; max_followers: number; min_followers: number; us_only: boolean; english_only: boolean };
export type Checked = { email: string | null; email_source: string | null; flags: string[]; reject: string | null; last_post_at: string | null; posts_7d: number; avg_views: number | null; languages: string[]; needsLink: boolean };

export const FLAG_TEXT: Record<string, string> = {
  no_email: "Нет почты", no_ugc_bio: "В описании нет UGC", stale: "Давно не постит", private: "Закрытый аккаунт", too_big: "Слишком много подписчиков, похоже на инфлюенсера",
  too_small: "Слишком мало подписчиков", not_us_region: "Аккаунт не из США", not_us_bio: "В описании другая страна", not_english: "Пишет не на английском", influencer_words: "В описании слова инфлюенсера", email_in_link: "Почта, возможно, в ссылке из био",
};

// Hard filters. A reject here never reaches a person; soft flags go to the AI and the reviewer.
export function check(p: Profile, r: Rules): Checked {
  const flags: string[] = [];
  const email = (p.business_email ? p.business_email.toLowerCase() : null) ?? extractEmails(p.bio)[0] ?? null;
  const email_source = p.business_email ? "business" : email ? "bio" : null;
  const dated = p.posts.filter((x) => x.at);
  const last_post_at = dated[0]?.at ?? null;
  const posts_7d = dated.filter((x) => daysAgo(x.at) <= 7).length;
  const views = p.posts.map((x) => x.views).filter((v): v is number => typeof v === "number");
  const avg_views = views.length ? Math.round(views.reduce((a, b) => a + b, 0) / views.length) : null;
  const langs = p.posts.map((x) => x.lang).filter((l): l is string => !!l && l !== "un");
  const languages = [...new Set(langs)];
  const ugc = mentionsUgc(p.bio) || (p.posts.slice(0, 6).some((x) => /#ugc\b|#ugccreator/i.test(x.caption ?? "")) && /\bugc\b/i.test(p.name ?? ""));
  const needsLink = !email && !!p.bio_link && mentionsUgc(p.bio);
  if (!email) flags.push(needsLink ? "email_in_link" : "no_email");
  if (!ugc) flags.push("no_ugc_bio");
  if (p.private) flags.push("private");
  if (daysAgo(last_post_at) > r.fresh_days) flags.push("stale");
  if (r.max_followers && (p.followers ?? 0) > r.max_followers) flags.push("too_big");
  if (r.min_followers && (p.followers ?? 0) < r.min_followers) flags.push("too_small");
  if (p.region && p.region.toUpperCase() !== "US") flags.push("not_us_region");
  if (bioCountry(p.bio) === "other") flags.push("not_us_bio");
  if (langs.length >= 2 && langs.filter((l) => l.startsWith("en")).length / langs.length < 0.5) flags.push("not_english");
  if (INFLUENCER_RE.test(p.bio ?? "")) flags.push("influencer_words");
  const hard = ["no_email", "private", "stale", "too_big", "too_small", ...(r.require_ugc_in_bio ? ["no_ugc_bio"] : []), ...(r.us_only ? ["not_us_region", "not_us_bio"] : []), ...(r.english_only ? ["not_english"] : [])];
  const reject = flags.find((f) => hard.includes(f)) ?? null;
  return { email, email_source, flags, reject, last_post_at, posts_7d, avg_views, languages, needsLink };
}

// Worth a profile check: discovery already shows a UGC bio with a way to reach them.
export function worthProfile(p: Profile) {
  if (p.private) return false;
  if (!p.bio) return p.platform === "instagram";
  return mentionsUgc(p.bio) && (extractEmails(p.bio).length > 0 || !!p.bio_link || p.platform === "instagram");
}

export { profileUrl };

