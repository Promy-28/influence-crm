import {test} from 'node:test';
import assert from 'node:assert/strict';
import {focusedIncoming,focusSnapshot,GREEN_YELLOW_CAMPAIGN} from '../src/lib/promy-bot/mail-focus.ts';
import {draftCard} from '../src/lib/promy-bot/draft-card.ts';
test('focus excludes red and old replies with inclusive October 25 and exclusive December boundary',()=>{
 const incoming=(at:string,campaign=GREEN_YELLOW_CAMPAIGN)=>({ue_type:2,campaign_id:campaign,timestamp_email:at});
 assert.equal(focusedIncoming(incoming('2026-10-25T04:00:00Z')),true);
 assert.equal(focusedIncoming(incoming('2026-10-25T03:59:59Z')),false);
 assert.equal(focusedIncoming(incoming('2026-12-01T04:59:59Z')),true);
 assert.equal(focusedIncoming(incoming('2026-12-01T05:00:00Z')),false);
 assert.equal(focusedIncoming(incoming('2026-11-01T12:00:00Z','red')),false);
 const result=focusSnapshot({complete:true,emails:[incoming('2026-11-01T12:00:00Z','red')]});
 assert.equal(result.emails.length,0);assert.equal(result.aggregate.messages,0);assert.equal(result.campaigns.length,0);
});
test('draft card shows original before proposal while bounding long original',()=>{
 const body='Hey Jane ,\n\nThank you.\n\nBest regards,\nKim';
 const card=draftCard({recipient:'jane@example.com',eaccount:'kim@example.com',subject:'Re: Work',incomingText:'My original question. '.repeat(500),body},'Краткое пояснение');
 assert.ok(card.length<=3900);assert.ok(card.indexOf('My original question.')<card.indexOf('ПРЕДЛАГАЕМЫЙ ОТВЕТ'));assert.ok(card.includes(body));assert.match(card,/Отправляй/);
});
