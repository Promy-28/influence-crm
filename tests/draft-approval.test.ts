import {test} from 'node:test';
import assert from 'node:assert/strict';
import {approvalToken,validDraftApproval,readyDraft,latestDrafts} from '../src/lib/draft-approval.ts';
import {renderReplyMacro,REPLY_BANNER} from '../src/lib/promy-bot/reply-macro.ts';
const fixture=()=>({id:'12345678',emailId:'incoming',campaign:'green',threadId:'thread',recipient:'jane@example.com',eaccount:'kim@example.com',subject:'Re: Work',status:'draft',createdAt:'2026-11-16T12:00:00Z',...renderReplyMacro({body:'Thank you for the update.',firstName:'Jane',signature:'Best regards,<br>Kim'})});
const now=Date.parse('2026-11-16T13:00:00Z');
test('approval is bound to exact shown content, recipient, sender, thread and status',()=>{
 const d=fixture(),token=approvalToken(d,'fixture');assert.equal(validDraftApproval(d,token,'fixture'),true);
 for(const field of ['html','body','recipient','eaccount','threadId','emailId','subject','status'])assert.equal(validDraftApproval({...d,[field]:'changed'},token,'fixture'),false,field);
 assert.equal(validDraftApproval(d,'bad','fixture'),false);assert.equal(validDraftApproval(d,token,'wrong-secret'),false);
});
test('only an intact Reply macro with its actual banner and fresh draft is eligible',()=>{
 const d=fixture();assert.equal(readyDraft(d,now),true);assert.equal(readyDraft({...d,html:d.html.replace(REPLY_BANNER,'https://example.com')},now),false);
 assert.equal(readyDraft({...d,macroName:'Other'},now),false);assert.equal(readyDraft({...d,status:'sent'},now),false);assert.equal(readyDraft(d,now+86400000),false);
 const unfinished={...d,...renderReplyMacro({body:'Here is the brief: [Insert brief details here]',firstName:d.macroFirstName,signature:d.signatureHtml})};assert.equal(readyDraft(unfinished,now),false);
});
test('editing middle preserves greeting signature and banner but invalidates previous approval',()=>{
 const d=fixture(),token=approvalToken(d,'fixture'),edited={...d,...renderReplyMacro({body:'A shorter reply.',firstName:d.macroFirstName,signature:d.signatureHtml})};
 assert.equal(edited.bannerUrl,REPLY_BANNER);assert.ok(edited.html.includes('Hey&nbsp;Jane'));assert.ok(edited.html.includes('Best regards,<br>Kim'));assert.equal(validDraftApproval(edited,token,'fixture'),false);assert.equal(readyDraft(edited,now),true);
});
test('newer revision or cancellation hides older ready version while sent history remains',()=>{
 const old=fixture(),newer={...old,id:'87654321',status:'cancelled',createdAt:'2026-11-16T12:01:00Z'},sent={...old,id:'abcdef01',status:'sent',emailId:'different'};
 assert.deepEqual(latestDrafts([old,newer,sent]).map(d=>d.id),['87654321','abcdef01']);
});
