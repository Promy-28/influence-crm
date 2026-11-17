import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateAnswer,validateBotAnswer} from '../src/lib/promy-bot/generate.ts';
test('model output is bounded and cannot specify recipient, send action or draft approval',()=>{
 assert.throws(()=>validateBotAnswer({answer:'a',draftBody:'x'.repeat(2801),requiresClarification:false}),/INVALID/);
 assert.throws(()=>validateBotAnswer({answer:'a',draftBody:'Hello',requiresClarification:'false'}),/INVALID/);
 assert.equal(validateBotAnswer({answer:'Accept the new rate?',draftBody:'We accept $65.',requiresClarification:true}).draftBody,'');
 assert.equal(validateBotAnswer({answer:'Готово',draftBody:'Here is the brief: [Insert brief details here]',requiresClarification:false}).requiresClarification,true);
});
test('free model returns a draft with store disabled and no paid fallback on quota',async()=>{
 const key=process.env.GEMINI_API_KEY,free=process.env.GEMINI_FREE_PROJECT_CONFIRMED;
 process.env.GEMINI_API_KEY='fixture';process.env.GEMINI_FREE_PROJECT_CONFIRMED='true';
 try{
  let calls=0;await assert.rejects(generateAnswer({ownerInstruction:'ответь ей'},async()=>{calls++;return new Response('{}',{status:429})}),/FREE_QUOTA/);assert.equal(calls,1);
  const result=await generateAnswer({ownerInstruction:'ответь ей'},async(url,opts)=>{assert.equal(String(url),'https://generativelanguage.googleapis.com/v1beta/interactions');const body=JSON.parse(String(opts?.body));assert.equal(body.store,false);assert.ok(!body.tools);return Response.json({output:[{type:'text',text:JSON.stringify({answer:'Готово',draftBody:'Hi Ariel, thanks!',requiresClarification:false})}]})});assert.equal(result.draftBody,'Hi Ariel, thanks!');
 }finally{if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;if(free===undefined)delete process.env.GEMINI_FREE_PROJECT_CONFIRMED;else process.env.GEMINI_FREE_PROJECT_CONFIRMED=free}
});
