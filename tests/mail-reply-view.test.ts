import test from 'node:test';
import assert from 'node:assert/strict';
import {focusedReply,draftLink,mailDate} from '../src/lib/mail-reply-view.ts';
test('a reply view never borrows proposals from a different incoming email',()=>{
 const w={drafts:[{emailId:'other',status:'draft'},{emailId:'a',status:'revision_requested'},{emailId:'a',status:'draft',id:'new'}],jobs:[{emailId:'other',answer:'wrong'},{emailId:'a',answer:'actual'}]};const x=focusedReply(w,'a');assert.equal(x.draft.id,'new');assert.equal(x.decision.answer,'actual');assert.equal(focusedReply(w,'missing').draft,null);
 const url=new URL(draftLink('reddit','a+b@example.com',true),'https://example.test');assert.equal(url.searchParams.get('email'),'a+b@example.com');assert.equal(url.searchParams.get('view'),'needs');assert.equal(url.searchParams.get('source'),'reddit');
});
test('dates use explicit New York timezone and distinguish missing dates',()=>{assert.match(mailDate('2026-11-17T06:00:00Z'),/01:00/);assert.match(mailDate('2026-11-17T06:00:00Z'),/2026/);assert.equal(mailDate(null),'Дата не указана')});
