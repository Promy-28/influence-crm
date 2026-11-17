import CampaignBadge from '@/components/CampaignBadge';
import {creatorCampaigns} from '@/lib/hub-data';
import {db} from '@/lib/db';
import {notFound} from 'next/navigation';
import {redditCampaigns,approvalToken} from '@/lib/hub-outreach';
import {sendRedditToCampaign} from '@/lib/hub-actions';
import {Submit} from '@/components/ui';
export default async function Outreach({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{campaign?:string}>}){
 const {id}=await params,sp=await searchParams;const {data:c}=await db.from('reddit_creator_directory').select('*').eq('id',id).maybeSingle();if(!c)notFound();
 const membership=await creatorCampaigns();const campaign=redditCampaigns.find(([value])=>value===sp.campaign),at=String(Date.now());
 return <div className="hub-stack" style={{maxWidth:760}}><a className="l" href="/creators?source=reddit">← Креаторы</a><h1>Добавить в рассылку</h1><section className="panel hub-section"><h2>{c.payload.name||c.payload.reddit||c.email}</h2><p className="mail-address">{c.email}</p><CampaignBadge ids={[...(membership.get(c.email.toLowerCase())||[])]}/><p>Выбери одну из двух существующих Reddit-кампаний. Цвет не запускает письма автоматически.</p>{campaign?<><div className="note"><b>{campaign[1]}</b><p>Подтверждение добавит этот адрес в кампанию. Если она активна, Instantly начнёт письма по её расписанию. Перед этим проверим дубли и запреты.</p></div><form action={sendRedditToCampaign}><input type="hidden" name="id" value={id}/><input type="hidden" name="campaign" value={campaign[0]}/><input type="hidden" name="at" value={at}/><input type="hidden" name="token" value={approvalToken(id,c.email,campaign[0],at)}/><Submit className="btn-p">Подтвердить добавление в {campaign[1]}</Submit></form></>:<div className="row">{redditCampaigns.map(([value,name])=><a className="btn" key={value} href={'/outreach/'+id+'?campaign='+value}>{name} →</a>)}</div>}</section></div>
}
