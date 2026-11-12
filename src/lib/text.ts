// Pure helpers with no server imports, so they are covered by tests.

const FREE_TLD = /\.(com|net|org|co|io|me|us|ca|uk|info|biz|xyz|studio|agency|media|life|live|art|shop|store|online|site|email|co\.uk)$/i;
const JUNK = /@(example|domain|email|gmail\.con|sentry|wixpress|2x\.png|3x\.png)\b|\.(png|jpe?g|gif|webp|svg)$/i;

// Finds emails in a bio, including the written-out forms creators use to dodge filters:
// "name at gmail dot com", "name [at] gmail [dot] com", "name(at)gmail.com", "📧 name @ gmail . com".
export function extractEmails(text?: string | null): string[] {
  if (!text) return [];
  let t = ` ${text} `.replace(/[​-‍﻿]/g, "");
  t = t.replace(/[＠]/g, "@").replace(/\s*[\[\(\{<]\s*(at|@)\s*[\]\)\}>]\s*/gi, "@").replace(/\s*[\[\(\{<]\s*(dot|\.)\s*[\]\)\}>]\s*/gi, ".");
  t = t.replace(/(\w)\s+at\s+(\w[\w-]*)\s+dot\s+(\w{2,})/gi, "$1@$2.$3");
  t = t.replace(/(\w)\s*@\s*([\w-]+)\s*\.\s*(com|net|org|co|io|me|us)\b/gi, "$1@$2.$3");
  t = t.replace(/(@[\w-]+)\s+dot\s+(\w{2,})/gi, "$1.$2");
  const found = t.match(/[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}/gi) ?? [];
  const out: string[] = [];
  for (let e of found) {
    e = e.toLowerCase().replace(/^[._-]+/, "").replace(/[._-]+$/, "");
    e = e.replace(/@gmail\.co$/, "@gmail.com").replace(/@gmial\.com$/, "@gmail.com").replace(/@gmail\.con$/, "@gmail.com");
    if (JUNK.test(e)) continue;
    if (!FREE_TLD.test(e) && !/\.[a-z]{2,6}$/.test(e)) continue;
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

export const UGC_RE = /\bugc\b|\bu\.g\.c\b|user[\s-]?generated|#ugc|ugc[a-z]*creator|ugccreator|content creator for brands/i;
export const mentionsUgc = (bio?: string | null) => UGC_RE.test(bio ?? "");

// Signals that an account is an influencer selling reach, not a UGC creator selling videos.
export const INFLUENCER_RE = /\b(influencer|brand ambassador|management|managed by|mgmt|talent agency|for collabs?:|booking)\b/i;

export function handleKey(h: string) { return h.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(tiktok|instagram)\.com\/@?/i, "").replace(/[/?#].*$/, "").toLowerCase(); }

export function profileUrl(platform: string, handle: string) { return platform === "tiktok" ? `https://www.tiktok.com/@${handle}` : `https://www.instagram.com/${handle}/`; }

// "Ariel 🌸 | UGC Creator" → "Ariel". Only a word that looks like a real first name; otherwise null.
export function guessFirstName(name?: string | null, handle?: string | null): string | null {
  const clean = (name ?? "").normalize("NFKC").replace(/[^\p{L}\s'’-]/gu, " ").replace(/\s+/g, " ").trim();
  const bad = /^(ugc|creator|content|the|official|by|mom|mama|life|style|beauty|travel|food|tech|lifestyle|studio|media|vlogs?|shop|store|brand|daily|her|his|its|real|with|and|from)$/i;
  const w = clean.split(" ").find((x) => /^\p{L}{2,14}$/u.test(x) && !bad.test(x));
  if (w) return w[0].toUpperCase() + w.slice(1).toLowerCase();
  void handle; return null;
}

const US_STATES = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const US_NAMES = "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|NYC|LA|Atlanta|Chicago|Houston|Dallas|Miami|Seattle|Boston|Denver|Phoenix|Nashville|Austin|San Diego|Orlando|Las Vegas";
// What the bio itself says about location. null = it does not say.
export function bioCountry(bio?: string | null): "US" | "other" | null {
  const b = bio ?? "";
  if (/🇺🇸|\bUSA\b|\bU\.S\.A?\b|\bUnited States\b|\bus[- ]based\b|\bamerican\b/i.test(b)) return "US";
  if (new RegExp(`\\b(${US_NAMES})\\b|📍\\s*[\\p{L} ]+,\\s*(${US_STATES})\\b`, "u").test(b)) return "US";
  if (/🇨🇦|🇬🇧|🇳🇬|🇵🇭|🇮🇳|🇧🇷|🇲🇽|🇿🇦|🇦🇺|🇩🇪|🇫🇷|🇪🇸|🇮🇹|🇵🇰|🇰🇪|🇬🇭|🇨🇴|🇦🇷|\b(UK|Canada|Nigeria|Philippines|India|Brazil|Mexico|South Africa|Australia|Germany|London|Toronto|Lagos|Manila|Dubai|Pakistan|Kenya|Ghana)\b/i.test(b)) return "other";
  return null;
}

export const daysAgo = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity);

// Short, unambiguous code for the signup link: no 0/O/1/l.
export function refCode(n = 7) { const a = "23456789abcdefghjkmnpqrstuvwxyz"; let s = ""; const r = crypto.getRandomValues(new Uint8Array(n)); for (const x of r) s += a[x % a.length]; return s; }

export function fill(t: string, vars: Record<string, string>) { return t.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m)); }

// Plain text → the HTML Instantly expects; a blank personal line does not leave a hole.
export function toHtml(t: string) { return t.replace(/\n{3,}/g, "\n\n").split("\n").map((l) => (l ? `<div>${l}</div>` : "<div><br /></div>")).join(""); }

// How much of the AI draft the manager changed: 0 = sent as is, 1 = rewritten.
export function editShare(a: string, b: string) {
  const x = a.trim().split(/\s+/), y = b.trim().split(/\s+/);
  if (!x.length && !y.length) return 0;
  const dp = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) dp[0][j] = j;
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  return Math.min(1, dp[x.length][y.length] / Math.max(x.length, y.length));
}

export function hashtags(text?: string | null) { return [...new Set(((text ?? "").match(/#[\p{L}\p{N}_]{3,40}/gu) ?? []).map((h) => h.slice(1).toLowerCase()))]; }

// Simple CSV reader that handles quotes, commas and line breaks inside cells.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
