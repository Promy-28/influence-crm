import { test } from "node:test";
import assert from "node:assert/strict";
import { tiktokProfiles, igProfiles, check, worthProfile, igOwners } from "../src/lib/normalize.ts";
const now = Date.now(); const d = (days: number) => new Date(now - days * 864e5).toISOString();
const rules = { require_ugc_in_bio: true, fresh_days: 7, max_followers: 100000, min_followers: 0, us_only: true, english_only: true };
const tt = (name: string, sig: string, days: number[], extra: Record<string, unknown> = {}, lang = "en") => days.map((x, i) => ({ id: `${name}${i}`, text: `my ugc #ugccreator ${i}`, textLanguage: lang, createTimeISO: d(x), playCount: 1000 * (i + 1), webVideoUrl: `https://www.tiktok.com/@${name}/video/${i}`, authorMeta: { name, nickName: "Jess 🌸 UGC", signature: sig, fans: 4200, verified: false, privateAccount: false, avatar: "a.jpg", bioLink: null, ...extra } }));

test("tiktok: groups videos per author and passes a good UGC creator", () => {
  const ps = tiktokProfiles([...tt("jessugc", "UGC creator 📍 Austin, TX\n📧 jess.ugc@gmail.com", [1, 3, 9]), ...tt("other", "fashion lover", [2])]);
  assert.equal(ps.length, 2);
  const p = ps.find((x) => x.handle === "jessugc")!;
  assert.equal(p.posts.length, 3); assert.ok(p.posts[0].at! > p.posts[2].at!);
  const c = check(p, rules);
  assert.equal(c.email, "jess.ugc@gmail.com"); assert.equal(c.reject, null); assert.equal(c.posts_7d, 2); assert.equal(c.avg_views, 2000);
  assert.ok(worthProfile(p)); assert.ok(!worthProfile(ps.find((x) => x.handle === "other")!));
});
test("hard filters", () => {
  const [stale] = tiktokProfiles(tt("a", "ugc creator a@gmail.com", [20]));
  assert.equal(check(stale, rules).reject, "stale");
  const [noEmail] = tiktokProfiles(tt("b", "ugc creator dm me", [1]));
  assert.equal(check(noEmail, rules).reject, "no_email");
  const [link] = tiktokProfiles(tt("c", "ugc creator 👇", [1], { bioLink: "https://linktr.ee/c" }));
  const cl = check(link, rules); assert.ok(cl.needsLink); assert.ok(cl.flags.includes("email_in_link")); assert.equal(cl.reject, null);
  const [uk] = tiktokProfiles(tt("d", "UGC creator 🇬🇧 d@gmail.com", [1]));
  assert.equal(check(uk, rules).reject, "not_us_bio");
  const [region] = tiktokProfiles(tt("e", "UGC creator e@gmail.com", [1], { region: "PH" }));
  assert.equal(check(region, rules).reject, "not_us_region");
  const [es] = tiktokProfiles(tt("f", "UGC creator f@gmail.com", [1, 2, 3], {}, "es"));
  assert.equal(check(es, rules).reject, "not_english");
  const [big] = tiktokProfiles(tt("g", "UGC creator g@gmail.com", [1], { fans: 500000 }));
  assert.equal(check(big, rules).reject, "too_big");
  const [noUgc] = tiktokProfiles(tt("h", "mom of 2 h@gmail.com", [1], { nickName: "Hanna" }));
  assert.equal(check(noUgc, rules).reject, "no_ugc_bio");
  assert.equal(check(noUgc, { ...rules, require_ugc_in_bio: false }).reject, null);
});
test("instagram profiles and owners", () => {
  assert.deepEqual(igOwners([{ ownerUsername: "Kim_UGC" }, { ownerUsername: "kim_ugc" }, { owner: { username: "x" } }]).map((o) => o.handle), ["kim_ugc", "x"]);
  const [p] = igProfiles([{ username: "Kim_UGC", fullName: "Kim B", biography: "UGC Creator | nurse & mom", businessEmail: "Kim@Gmail.com", followersCount: 900, latestPosts: [{ shortCode: "abc", timestamp: d(2), caption: "hi", videoViewCount: 300 }, { url: "u2", timestamp: d(1) }] }]);
  assert.equal(p.handle, "kim_ugc"); assert.equal(p.posts[0].url, "u2");
  const c = check(p, rules); assert.equal(c.email, "kim@gmail.com"); assert.equal(c.email_source, "business"); assert.equal(c.reject, null);
});
