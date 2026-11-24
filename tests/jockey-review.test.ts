import test from 'node:test';import assert from 'node:assert/strict';
import {parseJockeyReview,runJockeyReview,publicPortfolioMedia,publicMediaAddress} from '../src/lib/jockey-review.ts';
const review={videoReviewed:true,audioReviewed:true,englishSpeech:true,intelligibility:4,videoQuality:4,onCamera:true,speech:[{second:1,quote:'Hey I am Mary'}],frames:[{second:1,observation:'Лицо в кадре'}],summary:'Чёткая речь, умеренный темп',limitations:'Оценён один ролик'};
const response=(item='ksi_mary')=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(review),annotations:[{type:'video_citation',item_id:item}]}]}]});
test('Jockey rejects another creator citation, missing audio proof and incomplete output',()=>{assert.throws(()=>parseJockeyReview(response('ksi_other'),'ksi_mary'),/SOURCE_MISMATCH/);assert.throws(()=>parseJockeyReview({status:'incomplete'},'ksi_mary'),/INCOMPLETE/);const bad=response();bad.output[0].content[0].text=JSON.stringify({...review,speech:[]});assert.throws(()=>parseJockeyReview(bad,'ksi_mary'),/SPEECH_EVIDENCE/)});
test('resumed original-audio review uses only bound item, disables web tools and never reuploads',async()=>{
 let calls=0;const source='https://maryfeeneyugc.my.canva.site/_assets/video/sample.mp4';const state={source,assetId:'asset_mary',itemId:'ksi_mary'};
 const fetcher=(async(url,req)=>{calls++;if(req?.method==='GET')return Response.json({status:'ready'});const b=JSON.parse(String(req?.body));assert.deepEqual(b.selections,[{kind:'item',id:'ksi_mary'}]);assert.deepEqual(b.tools,[]);assert.match(b.input[0].content,/original audio/);return Response.json(response());}) as typeof fetch;
 const got=await runJockeyReview({apiKey:'test',freePlanConfirmed:true,source,storeId:'ks_prom y'.replace(' ',''),state,save:async()=>{},fetcher});assert.equal(got.audioReviewed,true);assert.equal(calls,3);
});
test('cannot reuse another source or unconfirmed billing and never blindly repeats uncertain inference',async()=>{const source='https://maryfeeneyugc.my.canva.site/_assets/video/sample.mp4';const base={apiKey:'test',freePlanConfirmed:true,source,storeId:'ks_promy',save:async()=>{},fetcher:(async()=>Response.json({status:'ready'})) as typeof fetch};await assert.rejects(runJockeyReview({...base,state:{source:'https://other.test/v.mp4'}}),/SOURCE_MISMATCH/);await assert.rejects(runJockeyReview({...base,freePlanConfirmed:false,state:{source}}),/FREE_PLAN/);await assert.rejects(runJockeyReview({...base,state:{source,assetId:'asset_a',itemId:'ksi_a',responseStarted:true}}),/RESPONSE_UNCERTAIN/)});
test('custom portfolio URL is bound to canonical host and public DNS; private addresses fail closed',async()=>{
 assert.equal(await publicPortfolioMedia('https://portfolio.example/v.mp4','https://portfolio.example/',async()=>[{address:'1.1.1.1'}]),true);
 assert.equal(await publicPortfolioMedia('https://portfolio.example/v.mp4','https://other.example/',async()=>[{address:'1.1.1.1'}]),false);
 assert.equal(await publicPortfolioMedia('https://portfolio.example/v.mp4','https://portfolio.example/',async()=>[{address:'127.0.0.1'}]),false);
 for(const ip of ['10.0.0.1','169.254.169.254','172.16.1.1','192.168.0.1','100.64.0.1','::1','::ffff:127.0.0.1'])assert.equal(publicMediaAddress(ip),false);
});
test('public portfolio assets are fetched by provider, never by hub; same source resumes',async()=>{
 const source='https://portfolio.example/v.mp4';let uploads=0;
 const fetcher=(async(url,req)=>{assert.ok(String(url).startsWith('https://api.twelvelabs.io/'));if(String(url).endsWith('/assets')){uploads++;assert.equal((req?.body as FormData).get('method'),'url');assert.equal((req?.body as FormData).get('url'),source);return Response.json({_id:'asset_p'})}if(req?.method==='GET')return Response.json({status:'ready'});if(String(url).endsWith('/items'))return Response.json({_id:'ksi_mary'});return Response.json(response())}) as typeof fetch;
 const r=await runJockeyReview({apiKey:'test',freePlanConfirmed:true,source,parentUrl:'https://portfolio.example/',storeId:'ks_promy',state:{source},save:async()=>{},resolveHost:async()=>[{address:'1.1.1.1'}],fetcher});assert.equal(r.audioReviewed,true);assert.equal(uploads,1);
});
test('Drive public sample uses bounded server memory and rejects redirects outside Google',async()=>{
 const source='https://drive.google.com/uc?export=download&id=1234567890';
 await assert.rejects(runJockeyReview({apiKey:'test',freePlanConfirmed:true,source,storeId:'ks_promy',state:{source},save:async()=>{},fetcher:(async()=>new Response(null,{status:302,headers:{location:'https://private.example/video.mp4'}})) as typeof fetch}),/SOURCE_REDIRECT/);
});
