import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderReplyMacro,composeReplyMacro,REPLY_BANNER} from '../src/lib/promy-bot/reply-macro.ts';
test('Reply preserves provider name/signature/banner and inserts escaped content between them once',()=>{
 const r=renderReplyMacro({firstName:'Nadia',signature:'<div>Best regards,<br>Kim<br>Influencer Manager at Promy</div>',body:'Hi Nadia,\n\nThanks for the update.\n\nBest regards,\nKim\nInfluencer Manager at Promy'});
 assert.equal(r.body,'Hey Nadia,\n\nThanks for the update.\n\nBest regards,\nKim\nInfluencer Manager at Promy');assert.equal(r.replyContent,'Thanks for the update.');assert.ok(r.html.indexOf('Hey&nbsp;Nadia')<r.html.indexOf('Thanks for'));assert.ok(r.html.indexOf('Thanks for')<r.html.indexOf('id="signature"'));assert.ok(r.html.indexOf('id="signature"')<r.html.indexOf(REPLY_BANNER));assert.match(r.html,/width:600px/);assert.equal(r.html.split('<img ').length-1,1);
 assert.ok(renderReplyMacro({firstName:'A & B',signature:'Kim',body:'2 < 3'}).html.includes('2 &lt; 3'));
});
test('macro refuses missing variables and unsafe signature instead of silently losing branding',()=>{
 assert.throws(()=>renderReplyMacro({firstName:'',signature:'Kim',body:'Thanks'}),/FIRST_NAME/);assert.throws(()=>renderReplyMacro({firstName:'Nadia',signature:'',body:'Thanks'}),/SIGNATURE/);assert.throws(()=>renderReplyMacro({firstName:'Nadia',signature:'<img onerror="bad()">',body:'Thanks'}),/UNSAFE/);
});
test('macro uses exact current campaign lead and sender account signature, never guessed names',async()=>{
 const calls:string[]=[];const result=await composeReplyMacro(async(path,body)=>{calls.push(path);if(path.startsWith('/accounts/'))return {email:'kim@example.com',signature:'Best regards,\nKim'};assert.deepEqual(body,{contacts:['creator@example.com'],limit:100});return {items:[{email:'other@example.com',first_name:'Wrong'},{email:'creator@example.com',campaign:'old',first_name:'Old'},{email:'creator@example.com',campaign:'current',first_name:'Nadia'}]}},{body:'Thank you.',recipient:'creator@example.com',eaccount:'kim@example.com',campaignId:'current'});assert.equal(result.macroFirstName,'Nadia');assert.equal(calls.length,2);
});
