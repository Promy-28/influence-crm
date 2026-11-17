import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withCampaignBanner,BANNER_TARGET,BANNER_IMAGE} from '../src/lib/email-branding.ts';
import {briefReply,creatorPolicyIssue,CREATOR_BRIEF} from '../src/lib/creator-policy.ts';
import {renderReplyMacro} from '../src/lib/promy-bot/reply-macro.ts';
test('campaign and reply HTML have exactly one banner with the owner exact UTM destination',()=>{
 const raw='<div>Hey {{firstName}},</div><div>{{ref_link}}</div><div>{{sendingAccountFirstName}}</div>';
 const once=withCampaignBanner(raw),twice=withCampaignBanner(once);assert.equal(once,twice);assert.ok(once.startsWith(raw));assert.equal(once.split('<img ').length-1,1);assert.ok(once.includes(BANNER_TARGET.replace(/&/g,'&amp;')));assert.ok(once.includes(BANNER_IMAGE));
 const old=raw+'<div><img src="'+BANNER_IMAGE+'" style="width:600px;"></div>';assert.equal(withCampaignBanner(old).split('<img ').length-1,1);
 const r=renderReplyMacro({body:briefReply('brief'),firstName:'Cathy',signature:'Best regards,\nAmelia'});assert.equal(r.html.split('<img ').length-1,1);assert.ok(r.html.includes('href="'+CREATOR_BRIEF+'"'));assert.ok(r.html.includes('utm_content=dom1'));
});
test('approved presets request one complete watermarked video and allow review of an existing example without an early contract',()=>{
 for(const kind of ['brief','sample_first'] as const){const text=briefReply(kind);assert.ok(text.includes(CREATOR_BRIEF));assert.match(text,/one complete video/);assert.match(text,/watermark/);assert.match(text,/already have a video similar/);assert.match(text,/unpaid/);assert.equal(creatorPolicyIssue(text),null)}
 assert.ok(creatorPolicyIssue('Please send 3 separate hooks and a separate body clip.'));assert.equal(creatorPolicyIssue('No separate body clip or additional hooks are needed.'),null);assert.ok(creatorPolicyIssue('We will send the contract before reviewing your test video.'));
});
