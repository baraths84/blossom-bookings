import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {mkdtemp, rm, readFile, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
const root=process.env.BLOSSOM_PLUGIN_TEST_ROOT || fileURLToPath(new URL('../',import.meta.url));
const config=JSON.parse(await readFile(path.join(root,'.mcp.json'),'utf8'));
async function client(name,state) {
  const entry=config.mcpServers[name];
  const child=spawn(process.execPath,entry.args,{cwd:path.resolve(root,entry.cwd),env:{...process.env,BLOSSOM_BOOKINGS_STATE_PATH:state.path},stdio:['pipe','pipe','pipe']});
  const pending=new Map();let id=0,stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{const message=JSON.parse(line);pending.get(message.id)?.resolve(message);pending.delete(message.id);});
  child.on('exit',code=>{for(const p of pending.values())p.reject(Error(`Server exited ${code}: ${stderr}`));pending.clear();});
  const closed = new Promise(resolve => child.once('close', resolve));
  state.stopClients.push(() => {
    child.stdin.end();
    child.kill();
    lines.close();
    return closed;
  });
  const request=(method,params)=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n');});
  const initialized=await request('initialize',{protocolVersion:'2025-11-25',clientInfo:{name:'test',version:'1'},capabilities:{}});
  assert.equal(initialized.result.serverInfo.name,name);assert.equal(initialized.result.protocolVersion,'2025-11-25');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  return {request,call:async(name,args)=>(await request('tools/call',{name,arguments:args})).result};
}
async function temp(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'bookings-plugin-'));
  const stopClients = [];
  t.after(async () => {
    // Windows keeps SQLite files locked until every server using them has exited.
    await Promise.all(stopClients.map(stop => stop()));
    await rm(dir, {recursive: true, force: true});
  });
  return {path: path.join(dir, 'state.sqlite'), stopClients};
}
function admin(action,ticket,state) {return spawnSync(process.execPath,['tools/server.mjs','jira-mock',action,ticket],{cwd:root,env:{...process.env,BLOSSOM_BOOKINGS_STATE_PATH:state.path},encoding:'utf8'});}

test('manifest identity, isolated groups, copied skills and local assets are portable',async()=>{
  const manifest=JSON.parse(await readFile(path.join(root,'.codex-plugin/plugin.json'),'utf8'));
  assert.equal(manifest.name,'blossom-bookings');assert.equal(manifest.interface.displayName,'Blossom Bookings');
  assert.deepEqual(Object.keys(config.mcpServers),['jira-mock','figma-mock']);
  for(const name of await readdir(path.join(root,'skills'))) {
    assert.match(name,/^blossom-bookings-/);
    for(const file of ['SKILL.md','agents/openai.yaml']) {
      const text=await readFile(path.join(root,'skills',name,file),'utf8');assert.doesNotMatch(text,/blossom.bowl|localhost:3100/i);
    }
  }
  await readFile(path.join(root,manifest.interface.logo));
});
test('jira group retrieves actual booking requirements and rejects invalid or cross-group calls',{timeout:10000},async t=>{
  const c=await client('jira-mock',await temp(t));
  const tools=(await c.request('tools/list')).result.tools;assert.equal(tools.length,6);assert.ok(!tools.some(t=>t.name==='get_design'));
  const list=await c.call('list_issues',{});assert.equal(list.structuredContent.count,6);
  const issue=await c.call('get_issue',{ticketId:'BB-142'});assert.match(issue.structuredContent.markdown,/Changed stay dates/);
  for(const args of [{ticketId:'../../package'},{ticketId:'BB-142',extra:true},{ticketId:4},{}])assert.equal((await c.call('get_issue',args)).isError,true);
  assert.equal((await c.call('get_design',{designAssetId:'coupon-checkout'})).isError,true);
  assert.equal((await c.request('unknown')).error.code,-32601);
  assert.equal((await c.request('ping')).result.constructor,Object);
});
test('figma group returns Bookings design and light and dark applied-coupon WebP references',{timeout:10000},async t=>{
  const c=await client('figma-mock',await temp(t));assert.deepEqual((await c.request('tools/list')).result.tools.map(t=>t.name),['get_design']);
  const design=await c.call('get_design',{designAssetId:'coupon-checkout'});
  assert.equal(design.structuredContent,undefined);
  const brief=JSON.parse(design.content[0].text);
  assert.match(brief.markdown,/Bookings blue/);
  assert.equal(brief.note,'The light and dark screenshots show the Blossom Bookings checkout with BLOSSOM15 applied. Use the design brief for the required coupon behavior.');
  assert.equal(design.content.length,3);
  for(const [index,theme] of ['light','dark'].entries()) {
    const image=design.content[index+1];
    assert.equal(image.mimeType,'image/webp');
    const fixture=await readFile(path.join(root,'fixtures',`booking-checkout-coupon-applied-${theme}.webp`));
    assert.equal(fixture.subarray(0,4).toString(),'RIFF');
    assert.equal(fixture.subarray(8,12).toString(),'WEBP');
    assert.deepEqual(Buffer.from(image.data,'base64'),fixture);
  }
  assert.equal((await c.call('get_design',{designAssetId:'../../private'})).isError,true);
  assert.equal((await c.call('get_issue',{ticketId:'BB-142'})).isError,true);
});
test('claims persist across clients, reject other owners, and create one simulated draft on retry',{timeout:10000},async t=>{
  const state=await temp(t);assert.equal(admin('ready','BB-412',state).status,0);
  const a=await client('jira-mock',state),b=await client('jira-mock',state);
  const results=await Promise.all([a.call('claim_issue',{ticketId:'BB-412',runId:'a'}),b.call('claim_issue',{ticketId:'BB-412',runId:'b'})]);
  assert.equal(results.filter(r=>!r.isError).length,1);const owner=results[0].isError?'b':'a';
  assert.equal((await b.call('get_issue',{ticketId:'BB-412'})).structuredContent.workflow.claimedBy,owner);
  assert.equal((await a.call('update_issue',{ticketId:'BB-412',runId:'wrong',status:'Review',summary:'done',evidence:['test']})).isError,true);
  assert.equal((await a.call('update_issue',{ticketId:'BB-412',runId:owner,status:'Review',summary:'done'})).isError,true);
  const args={ticketId:'BB-412',runId:owner,title:'Add sorting',summary:'Verified sorting',evidence:['sorting test passed']};
  const pr=await a.call('create_pull_request',args),again=await b.call('create_pull_request',args);
  assert.equal(pr.structuredContent.status,'Review');assert.equal(pr.structuredContent.pullRequest.simulated,true);assert.deepEqual(pr.structuredContent.pullRequest,again.structuredContent.pullRequest);
  await a.call('close_issue',{ticketId:'BB-412'});assert.equal((await b.call('get_issue',{ticketId:'BB-412'})).structuredContent.status,'Review');
  assert.notEqual(admin('ready','BB-241',state).status,0);
  assert.equal(admin('reset','BB-412',state).status,0);assert.equal((await a.call('get_issue',{ticketId:'BB-412'})).structuredContent.status,'Todo');
});
