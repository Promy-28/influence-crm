import {validDraftApproval} from './draft-approval.ts';
export function regenerationSnapshot(d:any,input:{emailId:string;source:string;creatorId?:string|null;approval:unknown},secret:string){
 if(!d||!['draft','stale','expired'].includes(d.status)||d.emailId!==input.emailId||(d.mailSource||'reddit')!==input.source||input.source==='apify'&&d.creatorId!==input.creatorId||!validDraftApproval(d,input.approval,secret))throw Error('Черновик изменился или уже обработан. Обнови страницу и открой перегенерацию заново.');
 return {id:d.id,recipient:d.recipient,body:d.replyContent||d.body,createdAt:d.createdAt,editedAt:d.editedAt||null};
}
