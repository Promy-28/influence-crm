import {test} from 'node:test';
import assert from 'node:assert/strict';
import {questionCoverage,replyCoverageIssue} from '../src/lib/reply-coverage.ts';
import {approvedBriefRewrite} from '../src/lib/writing-style.ts';
import {briefReply,CREATOR_BRIEF} from '../src/lib/creator-policy.ts';
import {readyDraft} from '../src/lib/draft-approval.ts';
import {renderReplyMacro} from '../src/lib/promy-bot/reply-macro.ts';
const incoming=`I've created my account and uploaded my portfolio. Is this for a specific video order or mainly to join the creator network? Could you share more details about the brand or product and the type of content? How many videos and what are the expected formats and deadlines? Will they be used for organic content, paid ads, or both? Could you remind me of the rate per video I submitted and confirm the pricing? How payment works and what usage rights would be required?`;
test('Arielle regression: generic brief reply cannot silently drop commercial and project questions',()=>{
 const c=questionCoverage(incoming,briefReply('brief'));for(const topic of ['project','brand','deadline','rate','payment','usage','rights'] as const)assert.ok(c.missing.includes(topic),topic);
 assert.ok(replyCoverageIssue(incoming,briefReply('brief')));assert.equal(approvedBriefRewrite({replyContent:CREATOR_BRIEF,incomingText:incoming}),null);
});
test('separate substantive answers cover each topic; pointing at a future contract does not',()=>{
 const reply='This is a test for a potential paid project about Promy itself, not a confirmed order. Start with one full video, chosen hook + body, in vertical format. The proposed deadline is December 1. Your form quote was $11 per video, not yet agreed. Payment for a commissioned order would be by bank transfer after approval. Proposed usage is paid ads only. You retain ownership; any license needs agreement.';
 assert.equal(questionCoverage(incoming,reply).complete,true);
 assert.ok(questionCoverage(incoming,'The agreement covers payment terms, usage rights and deadlines. This test is unpaid.').missing.includes('payment'));
 assert.ok(questionCoverage('Organic content or paid ads?','We post on our own channels.').missing.includes('usage'));
});
test('simple brief requests remain supported and quoted historical questions do not block unrelated replies',()=>{
 assert.equal(replyCoverageIssue('Could you send the brief and scope?',briefReply('brief')),null);
 assert.equal(replyCoverageIssue('Thanks, interested!\n\nOn Monday Someone wrote:\nWhat is your rate and deadline?','Here is the brief.'),null);
 assert.equal(replyCoverageIssue('Thanks!\n\nEm sábado, Mark escreveu:\nHow payment works?','Here is the brief.'),null);
});
test('a fresh incomplete AI draft cannot become sendable by being selected, while explicit owner edits are preserved',()=>{
 const d={...renderReplyMacro({body:briefReply('brief'),firstName:'Arielle',signature:'Best regards,<br>Mark'}),status:'draft',createdAt:new Date().toISOString(),incomingText:incoming};
 assert.equal(readyDraft(d),false);const body=d.body,html=d.html;
 assert.equal(readyDraft({...d,editedAt:new Date().toISOString()}),true);assert.equal(d.body,body);assert.equal(d.html,html);
});
