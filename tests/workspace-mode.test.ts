import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveWorkspaceMode,modeDestination,normalizedMode} from '../src/lib/workspace-mode-core.ts';
test('saved source survives core navigation and explicit links select their source',()=>{
 for(const path of ['/','/creators','/inbox','/drafts'])assert.equal(resolveWorkspaceMode(path,null,'apify'),'apify');
 assert.equal(resolveWorkspaceMode('/inbox',null,null),'reddit');
 assert.equal(resolveWorkspaceMode('/inbox','reddit','apify'),'reddit');
 assert.equal(resolveWorkspaceMode('/creators','found','reddit'),'apify');
 assert.equal(resolveWorkspaceMode('/inbox',null,'reddit',true),'apify');
 assert.equal(resolveWorkspaceMode('/review','reddit','reddit'),'apify');
 assert.equal(resolveWorkspaceMode('/outreach/contact','apify','apify'),'reddit');
 assert.equal(normalizedMode('anything'),null);
});
test('mode change discards contact context and returns only safe local destinations',()=>{
 assert.equal(modeDestination('/inbox','apify'),'/inbox?source=apify');
 assert.equal(modeDestination('/creators/123','reddit'),'/creators?source=reddit');
 assert.equal(modeDestination('/review','reddit'),'/creators?source=reddit');
 assert.equal(modeDestination('/tests','reddit'),'/?source=reddit');
 for(const path of ['https://evil.test','//evil.test','/inbox?thread=old','/unknown'])assert.equal(modeDestination(path,'apify'),'/?source=apify');
});
