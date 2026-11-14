import { test } from "node:test";
import assert from "node:assert/strict";
import { extractEmails, mentionsUgc, guessFirstName, bioCountry, editShare, parseCsv, handleKey, hashtags, fill, toHtml } from "../src/lib/text.ts";
import { allocate, probBest } from "../src/lib/stats.ts";

test("emails: plain and obfuscated", () => {
  assert.deepEqual(extractEmails("UGC creator 🌸 📧 ariel.ugc@gmail.com"), ["ariel.ugc@gmail.com"]);
  assert.deepEqual(extractEmails("collabs: jess at gmail dot com"), ["jess@gmail.com"]);
  assert.deepEqual(extractEmails("work: jess [at] yahoo [dot] com"), ["jess@yahoo.com"]);
  assert.deepEqual(extractEmails("jess(at)outlook.com"), ["jess@outlook.com"]);
  assert.deepEqual(extractEmails("jess @ gmail . com ✨"), ["jess@gmail.com"]);
  assert.deepEqual(extractEmails("kitaraugc@gmail.con"), ["kitaraugc@gmail.com"]);
  assert.deepEqual(extractEmails("Hi.Contact:Payne.UGC@Gmail.com."), ["payne.ugc@gmail.com"]);
  assert.deepEqual(extractEmails("no email here, just vibes @ the beach"), []);
  assert.deepEqual(extractEmails("img@2x.png"), []);
});
test("ugc detection", () => {
  assert.ok(mentionsUgc("UGC Creator | mom of 3")); assert.ok(mentionsUgc("#ugccreator")); assert.ok(mentionsUgc("user-generated content"));
  assert.ok(!mentionsUgc("fashion | beauty | lifestyle")); assert.ok(!mentionsUgc("hugcats"));
});
test("first name", () => {
  assert.equal(guessFirstName("Ariel 🌸 | UGC Creator"), "Ariel"); assert.equal(guessFirstName("UGC by Jess"), "Jess"); assert.equal(guessFirstName("✨✨"), null); assert.equal(guessFirstName("JANICE LEE"), "Janice");
});
test("country from bio", () => {
  assert.equal(bioCountry("📍 Austin, TX | UGC"), "US"); assert.equal(bioCountry("NYC based creator"), "US"); assert.equal(bioCountry("🇺🇸 ugc"), "US");
  assert.equal(bioCountry("Lagos based UGC"), "other"); assert.equal(bioCountry("ugc creator"), null);
});
test("misc", () => {
  assert.equal(editShare("hello there friend", "hello there friend"), 0); assert.ok(editShare("a b c d", "a x c d") > 0.2);
  assert.deepEqual(parseCsv('a,b\n"x, y","line\nbreak"\n'), [["a", "b"], ["x, y", "line\nbreak"]]);
  assert.equal(handleKey("https://www.tiktok.com/@ArielDoesUGC?_r=1"), "arieldoesugc"); assert.equal(handleKey("@Foo"), "foo");
  assert.deepEqual(hashtags("love #UGCcreator and #ugc_tips #a"), ["ugccreator", "ugc_tips"]);
  assert.equal(fill("Hi {{firstName}}, {{x}}", { firstName: "Al" }), "Hi Al, {{x}}");
  assert.equal(toHtml("a\n\n\n\nb"), "<div>a</div><div><br /></div><div>b</div>");
});
test("bandit", () => {
  const p = probBest([{ id: "a", n: 500, k: 50 }, { id: "b", n: 500, k: 90 }]); assert.ok(p.b > 0.99);
  const al = allocate([{ id: "a", n: 500, k: 50 }, { id: "b", n: 500, k: 90 }], 5000, 0.2); assert.equal(al.a + al.b, 5000); assert.ok(al.a > 850 && al.a < 1150, String(al.a));
  const small = { a: 0, b: 0 }; for (let i = 0; i < 2000; i++) { const x = allocate([{ id: "a", n: 0, k: 0 }, { id: "b", n: 0, k: 0 }], 2, 0.2); small.a += x.a; small.b += x.b; } assert.ok(Math.abs(small.a - small.b) < 300, JSON.stringify(small));
  const even = allocate([{ id: "a", n: 0, k: 0 }, { id: "b", n: 0, k: 0 }, { id: "c", n: 0, k: 0 }], 10, 0.2); assert.equal(even.a + even.b + even.c, 10);
});
import { STARTER, HYPOTHESES, applyChange, unknownVars, nextFocus } from "../src/lib/templates.ts";
test("templates", () => {
  for (const a of STARTER) for (const s of a.steps) { assert.deepEqual(unknownVars(s.subject + s.body), []); assert.ok(!/—/.test(s.body + s.subject)); }
  for (const h of HYPOTHESES) {
    const out = applyChange(STARTER[0].steps, h.change);
    assert.ok(out.length >= 2, h.id); assert.deepEqual(unknownVars(out.map((s) => s.subject + s.body).join(" ")), [], h.id); assert.ok(!/—/.test(JSON.stringify(out)), h.id);
    assert.notDeepEqual(out, STARTER[0].steps, h.id);
  }
  const ps = applyChange(STARTER[0].steps, { kind: "ps", value: "P.S. hi" }); assert.ok(ps[0].body.endsWith("Promy\n\nP.S. hi"));
  assert.equal(nextFocus(50, 0.5, 0.1, 0.5).metric, null); assert.equal(nextFocus(300, 0.3, 0.1, 0.5).metric, "open"); assert.equal(nextFocus(300, 0.6, 0.03, 0.5).metric, "reply"); assert.equal(nextFocus(300, 0.6, 0.1, 0.2).metric, "registered");
});
