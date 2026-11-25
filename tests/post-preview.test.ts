import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicHttps,expiredPostAsset,tiktokPlayer,tiktokPostCover,postCoverKey} from '../src/lib/post-preview.ts';
test('expired signed CDN images are recognized independently of Gemini or video availability',()=>{
 const now=Date.parse('2026-11-19T12:00:00Z');
 assert.equal(expiredPostAsset('https://p19.tiktokcdn.com/image?x-expires=1794970800',now),true);
 assert.equal(expiredPostAsset('https://cdn.example.com/image?Expires=1994970800',now),false);
 assert.equal(expiredPostAsset('https://s.cdninstagram.com/image?oe=00000001',now),true);
 assert.equal(expiredPostAsset('https://cdn.example.com/cover.jpg',now),false);
 assert.equal(expiredPostAsset(null,now),true);
});
test('restored TikTok image belongs to the exact saved post and author',()=>{
 const post='https://www.tiktok.com/@creator/video/7707305561687198998';
 const cover='https://p16-common-sign.tiktokcdn-us.com/cover.jpg';
 const item={id:'7707305561687198998',author:{uniqueId:'creator'},video:{cover}};
 const make=(v:typeof item)=>'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">'+JSON.stringify({__DEFAULT_SCOPE__:{'webapp.video-detail':{itemInfo:{itemStruct:v}}}})+'</script>';
 assert.equal(tiktokPostCover(make(item),post),cover);
 assert.equal(tiktokPostCover(make({...item,id:'7707305561687198999'}),post),null);
 assert.equal(tiktokPostCover(make({...item,author:{uniqueId:'other'}}),post),null);
 assert.equal(postCoverKey('https://www.instagram.com/reel/Evidence_1/'),'ig-Evidence_1');
});
test('official player binds to exact public TikTok post and rejects lookalikes or injected URLs',()=>{
 assert.equal(tiktokPlayer('https://www.tiktok.com/@linh.garcia.le/video/7707305561687198998'),'https://www.tiktok.com/player/v1/7707305561687198998?autoplay=0&controls=1&description=0&music_info=0');
 for(const input of ['https://tiktok.com.evil.test/@x/video/7707305561687198998','javascript:alert(1)','https://evil.test','https://www.tiktok.com/@creator','https://user@www.tiktok.com/@x/video/7707305561687198998'])assert.equal(tiktokPlayer(input),null);
 assert.equal(publicHttps('javascript:alert(1)'),null);
});
