import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePost,validateWarmupProposal,type FarmAccount,type FarmDetail} from '../src/lib/farm-contract.ts';
const account:FarmAccount={id:'11111111-1111-4111-8111-111111111111',platform:'reddit',handle:'fixture',status:'warming',phone:'test',profile:'fixture',warm_start:null,program_id:null,program_name:null};
const post={account_id:account.id,external_id:'hub-fixture',title:'How do you plan a first portfolio?',text:'What helped you choose which examples to include?',subreddit:'r/UGCcreators'};
test('Reddit posts bind to an actual available Reddit account and normalize a community, without imposing invented karma requirements',()=>{
 assert.equal(validatePost(post,[account]).subreddit,'UGCcreators');
 for(const status of ['needs_human','banned','paused'])assert.throws(()=>validatePost(post,[{...account,status}]));
 assert.throws(()=>validatePost(post,[{...account,platform:'threads'}]));assert.throws(()=>validatePost({...post,account_id:'foreign'},[account]));
});
test('post validation blocks links, outreach bait, malformed IDs and bad scheduling before upstream mutation',()=>{
 for(const text of ['https://example.com','www.example.com','DM me','link in bio','@someone'])assert.throws(()=>validatePost({...post,text},[account]));
 for(const change of [{external_id:'../escape'},{title:''},{subreddit:'../escape'},{scheduled_at:'2020-01-01T00:00:00Z'},{scheduled_at:'2030-01-01T12:00:00'}])assert.throws(()=>validatePost({...post,...change},[account]));
 assert.equal(validatePost({...post,scheduled_at:'2030-01-01T12:00:00Z'},[account],0).scheduled_at,'2030-01-01T12:00:00Z');
});
const program:FarmDetail={id:'program',name:'Test',description:'Fixture',version:2,profile_count:3,editable:true,reddit:{enabled:true,items:{comments:{on:false,min:0.01,max:0.02},likes:{on:true,min:0.01,max:0.03}},minutes:[10,15],per_day:[1,2]},reddit_calibrated:['likes'],session_minutes:[10,15],sessions_per_day:[1,2],proposals:[]};
test('a Reddit warmup proposal preserves the exact existing ranges and cannot alter Threads or activate an uncalibrated action',()=>{
 const before=structuredClone(program),body=validateWarmupProposal({base_version:2,note:'Pause likes for review',actions:{comments:false,likes:false}},program);
 assert.equal(body.reddit.items.likes.on,false);assert.equal(body.reddit.items.likes.max,0.03);assert.deepEqual(body.reddit.minutes,[10,15]);assert.equal(Object.hasOwn(body,'threads'),false);assert.deepEqual(program,before);
 assert.throws(()=>validateWarmupProposal({base_version:2,note:'test',actions:{comments:true,likes:true}},program));
 assert.throws(()=>validateWarmupProposal({base_version:1,note:'test',actions:{comments:false,likes:false}},program));
 assert.throws(()=>validateWarmupProposal({base_version:2,note:'test',actions:{comments:false,likes:false}}, {...program,editable:false}));
 assert.throws(()=>validateWarmupProposal({base_version:2,note:'test',actions:{comments:false,likes:true,unknown:true}},program));
});
