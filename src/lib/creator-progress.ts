export function creatorReviewState(c:any):'great'|'maybe'|'no'|'queued'|'unverified'|'untouched'{
 const p=c.payload||{},a=p.assessment;
 if(c.review_pending||p.reviewStatus==='pending_review'||(p.sourceFingerprint&&p.reviewSourceFingerprint!==p.sourceFingerprint))return 'queued';
 if(a?.videoReviewed===true&&a?.audioReviewed===true&&['great','maybe','no'].includes(a.decision))return a.decision;
 return a?'unverified':'untouched';
}
export function creatorProgress(rows:any[]){
 const counts={total:rows.length,checked:0,great:0,maybe:0,no:0,remaining:0,queued:0,unverified:0,untouched:0};
 const owner={great:0,maybe:0,no:0,unreviewed:0};
 for(const c of rows){const state=creatorReviewState(c);counts[state]++;const rating=c.rating as keyof typeof owner;if(['great','maybe','no'].includes(rating))owner[rating]++;else owner.unreviewed++}
 counts.checked=counts.great+counts.maybe+counts.no;counts.remaining=counts.total-counts.checked;
 return {...counts,owner,percent:counts.total?Math.round(counts.checked/counts.total*100):0};
}
