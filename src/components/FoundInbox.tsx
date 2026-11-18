import RedditInbox from './RedditInbox';
import {apifyThread} from '@/lib/apify-thread';
import MailReplyPanel from './MailReplyPanel';
import {draftWorkspace} from '@/lib/draft-workspace';
import {focusedReply,mailDate} from '@/lib/mail-reply-view';
import CampaignBadge from './CampaignBadge';
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { LABELS } from "@/lib/replies";
import { fmtTime, ago, n } from "@/lib/format";
import { TabLink, Submit } from "@/components/ui";
import { doneDialog, manualReply, redraft, relabel, sendDraftAction, setLabel, skipDraft } from "@/lib/actions";

type C = {inst_reply_uuid?:string;inst_campaign_id?:string; id: string; handle: string; name: string | null; email: string; avatar_url: string | null; platform: string; profile_url: string | null; followers: number | null; reply_label: string | null; last_reply_at: string | null; needs_reply: boolean; registered_at: string | null; profile_done_at: string | null; ref_code: string | null; eaccount: string | null; bio: string | null };
export default async function Inbox({ searchParams }: { searchParams: Promise<{ c?: string; f?: string; err?: string; page?: string }> }) {
  const sp = await searchParams; const page=Math.max(0,Number(sp.page)||0); const s0 = await getSettings(); const f = sp.f ?? ("all");
  const base = db.from("creators").select("id,handle,name,email,avatar_url,platform,profile_url,followers,reply_label,last_reply_at,needs_reply,registered_at,profile_done_at,ref_code,eaccount,bio,inst_reply_uuid,inst_campaign_id,human_reason,needs_human").eq("source", "apify").or("first_sent_at.not.is.null,replied_at.not.is.null").order("last_reply_at", { ascending: false, nullsFirst: false }).range(page*100,page*100+99);
  const q = f === "human" ? base.eq("source","apify").eq("needs_human", true) : f === "wait" ? base.eq("source","apify").eq("needs_reply", true) : f === "pos" ? base.not("positive_at", "is", null) : base;
  const [{ data: list }, { count: waiting }, { data: sched }, { count: human }] = await Promise.all([q, db.from("creators").select("id", { count: "exact", head: true }).eq("source","apify").eq("needs_reply", true), db.from("drafts").select("creator_id").eq("status", "scheduled"), db.from("creators").select("id", { count: "exact", head: true }).eq("source","apify").eq("needs_human", true)]);
  const s = s0;
  const rows = (list ?? []) as C[];
  const {data:observed}=rows.length?await db.from('messages').select('creator_id,at,direction,inst_email_id').in('creator_id',rows.map(r=>r.id)).order('at',{ascending:false}).limit(2000):{data:[]};const latestByCreator=new Map<string,any>();for(const m of observed||[])if(!latestByCreator.has(m.creator_id))latestByCreator.set(m.creator_id,m);
  const cur = rows.find((r) => r.id === sp.c) ?? (sp.c ? ((await db.from("creators").select("id,handle,name,email,avatar_url,platform,profile_url,followers,reply_label,last_reply_at,needs_reply,registered_at,profile_done_at,ref_code,eaccount,bio,inst_reply_uuid,inst_campaign_id,human_reason,needs_human").eq("id", sp.c).eq("source","apify").maybeSingle()).data as C | null) : rows[0]);
  const next = rows[rows.findIndex((r) => r.id === cur?.id) + 1]?.id ?? "";
  const initial=cur?await apifyThread(cur.id):null;
  return <div className="flex flex-col gap-3 dlg-page">
    <div className="dlg-top"><h1>Почта · Apify</h1><p className="sub">Проверяй историю и кого мы ждём. Ответы и фолоуапы после 48 часов готовятся автоматически в «Черновиках». Отправка — только после твоего подтверждения.</p></div>
    <div className="row"><a className="btn-p" href="/drafts?source=apify">Разобрать пачку Apify →</a></div>
    <div className="tabs dlg-filters"><TabLink href="/inbox?source=apify&f=human" on={f === "human"}>Нужен человек<span className="tab-n">{human ?? 0}</span></TabLink><TabLink href="/inbox?source=apify&f=wait" on={f === "wait"}>Ждут ответа<span className="tab-n">{waiting ?? 0}</span></TabLink><TabLink href="/inbox?source=apify&f=pos" on={f === "pos"}>С интересом</TabLink><TabLink href="/inbox?source=apify&f=all" on={f === "all"}>Все переписки</TabLink></div>
    {sp.err && <div className="errbox">{sp.err}</div>}
    <div className="row">{page>0&&<a className="btn" href={`/inbox?source=apify&f=${f}&page=${page-1}`}>← Назад</a>}{rows.length===100&&<a className="btn" href={`/inbox?source=apify&f=${f}&page=${page+1}`}>Следующие 100 →</a>}</div>
    <RedditInbox source="apify" rows={rows.map(r=>({...r,sender:r.email,name:r.name||r.handle,campaignIds:r.inst_campaign_id?[r.inst_campaign_id]:[],state:r.needs_reply?'waiting_on_us':'waiting_on_them',lastMessageAt:latestByCreator.get(r.id)?.at||r.last_reply_at,latestInboundId:r.inst_reply_uuid,latestMessageId:latestByCreator.get(r.id)?.inst_email_id}))} initial={initial} filters={{f,page:String(page)}} labels={LABELS}/>
    </div>;
}
