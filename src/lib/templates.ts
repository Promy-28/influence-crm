// Starting test: does a signup link in the first email beat "reply and I'll send it"?
// Variables: {{firstName}} {{line}} {{ref_link}} {{handle}} come from the tool; {{sendingAccountFirstName}} is Instantly's sender name.
export type Step = { subject: string; body: string; delay_days: number };

const sign = "{{sendingAccountFirstName}}\nPromy · promy.io";

const fu = (): Step[] => [
  { subject: "", delay_days: 3, body: `Hi {{firstName}}, quick nudge on this.\n\nSigning up is free and takes a few minutes. Once your creator profile is live, brands can send you paid briefs directly:\n{{ref_link}}\n\n${sign}` },
  { subject: "", delay_days: 4, body: `Last note from me, {{firstName}}. If paid UGC work isn't for you right now, no worries at all.\n\nIf it is, here's your link: {{ref_link}}\n\n${sign}` },
];

export const STARTER: { label: string; name: string; steps: Step[] }[] = [
  {
    label: "A", name: "Ссылка в первом письме",
    steps: [{ subject: "paid UGC work from app brands", delay_days: 0, body: `Hi {{firstName}},\n\n{{line}}\n\nI'm {{sendingAccountFirstName}} from Promy. US app brands order on-camera UGC videos through us every week. The brand sets the price per video, you get paid as soon as a video is approved, and there's no cap on how many you make.\n\nYour creator profile takes about 3 minutes:\n{{ref_link}}\n\nAny questions, just reply here.\n\n${sign}` }, ...fu()],
  },
  {
    label: "B", name: "Без ссылки, просим ответить",
    steps: [{ subject: "UGC for app brands?", delay_days: 0, body: `Hi {{firstName}},\n\n{{line}}\n\nI'm {{sendingAccountFirstName}} from Promy. We connect UGC creators with US app brands that need on-camera videos every week. Brands set the price per video and you get paid the moment a video is approved.\n\nOpen to paid briefs like that? Reply "yes" and I'll send the details.\n\n${sign}` }, ...fu()],
  },
];

// The variables a step may use, for the editor hint and a sanity check before saving.
export const VARS = ["firstName", "line", "ref_link", "handle", "sendingAccountFirstName"];
export function unknownVars(t: string) { return [...t.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).filter((v) => !VARS.includes(v)); }
