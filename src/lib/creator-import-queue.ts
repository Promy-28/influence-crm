import {createHmac,timingSafeEqual} from 'node:crypto';
export type ApprovedCreator={id:string;email:string;campaign:string;fingerprint:string;approvedAt:string;approvedBy:string;proof:string;status:'pending'|'processing'|'done'|'blocked'|'uncertain';message?:string};
type ApprovalFields=Pick<ApprovedCreator,'id'|'email'|'campaign'|'fingerprint'|'approvedAt'|'approvedBy'>;
export function queuedApprovalProof(j:ApprovalFields,secret:string){return createHmac('sha256',secret).update(JSON.stringify(['creator-import-v1',j.id,j.email,j.campaign,j.fingerprint,j.approvedAt,j.approvedBy])).digest('hex')}
export function validQueuedApproval(j:ApprovedCreator,secret:string){
 if(!secret||!j.approvedBy||!Number.isFinite(Date.parse(j.approvedAt))||Date.parse(j.approvedAt)>Date.now()+60000)return false;
 const a=Buffer.from(queuedApprovalProof(j,secret)),b=Buffer.from(j.proof||'');return a.length===b.length&&timingSafeEqual(a,b);
}
// A persisted approval authorizes only its exact frozen card, never later arrivals or edits.
export function queuedCreatorUnchanged(j:ApprovedCreator,c:{email:string},fingerprint:string,secret:string){return validQueuedApproval(j,secret)&&j.email===c.email&&j.fingerprint===fingerprint}
