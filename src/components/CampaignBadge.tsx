import {campaignInfo} from '@/lib/campaign-context';
export default function CampaignBadge({ids=[]}:{ids?:string[]}){return <span className="row" style={{gap:5,marginTop:5}}>{ids.length?ids.map(id=>{const c=campaignInfo(id);return <span key={id} className={'tag '+c.tone} title={'Кампания Instantly: '+id}>{c.label}</span>}):<span className="tag">Кампания не подтверждена</span>}</span>}
