import { createInterface } from 'node:readline';
import { readFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const service = process.argv[2];
if (!['jira-mock', 'figma-mock'].includes(service)) {
  console.error('Use: node tools/server.mjs jira-mock|figma-mock'); process.exit(1);
}
const ids = ['BB-142', 'BB-241', 'BB-242', 'BB-412', 'BB-998', 'BB-999'];
const statuses = ['Todo', 'Ready', 'In Progress', 'Needs Input', 'Review', 'Done'];
const string = {type:'string', minLength:1, maxLength:2000};
const ticketId = {type:'string', enum:ids};
const runId = {...string, maxLength:200};
const evidence = {type:'array', items:string, minItems:1, maxItems:30};
const spec = (name, description, properties, required=[], write=false, destructive=false) => ({
  name, description, inputSchema:{type:'object', properties, required, additionalProperties:false},
  annotations:{readOnlyHint:!write, destructiveHint:destructive, openWorldHint:false},
});
const tools = service === 'jira-mock' ? [
  spec('list_issues','List local fictional Blossom Bookings tickets, optionally by status. No real Jira connection.',{status:{type:'string',enum:statuses}}),
  spec('get_issue','Read a Bookings ticket, its requirements, design reference and local workflow state.',{ticketId},['ticketId']),
  spec('claim_issue','Atomically claim a Ready mock ticket for this run. Changes only local workshop state.',{ticketId,runId},['ticketId','runId'],true),
  spec('update_issue','Move this run’s claimed mock ticket to Review with evidence, or Needs Input with a blocking question.',{ticketId,runId,status:{type:'string',enum:['Needs Input','Review']},summary:string,evidence},['ticketId','runId','status','summary'],true),
  spec('create_pull_request','Create an idempotent local simulated draft PR and move the claimed ticket to Review. Never pushes or creates a real PR.',{ticketId,runId,title:string,summary:string,evidence},['ticketId','runId','title','summary','evidence'],true),
  spec('close_issue','Preview a simulated ticket closure only when explicitly requested. Does not persist a closure or change an external tracker.',{ticketId},['ticketId'],true,true),
] : [spec('get_design','Read the approved Blossom Bookings coupon design and reference screenshots. No real Figma connection.',{designAssetId:{type:'string',enum:['coupon-checkout']}},['designAssetId'])];
let db;
async function database() {
  if (!db) {
    const filename = process.env.BLOSSOM_BOOKINGS_STATE_PATH || path.join(homedir(),'.blossom-bookings','issues.sqlite');
    await mkdir(path.dirname(filename),{recursive:true});
    db = new DatabaseSync(filename);
    db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS issues (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }
  return db;
}
async function issue(id) {
  const markdown = await readFile(new URL(`../fixtures/issues/${id}.md`,import.meta.url),'utf8');
  const state = JSON.parse((await database()).prepare('SELECT value FROM issues WHERE id=?').get(id)?.value || '{}');
  return {id,title:markdown.split('\n')[0].replace(/^# BB-\d+ — /,''),status:state.status || 'Todo',priority:id==='BB-142'?1:2,
    ...(['BB-241','BB-242'].includes(id)?{designAssetId:'coupon-checkout'}:{}),markdown,workflow:state};
}
function validate(value,schema,label='arguments') {
  if (schema.type==='object') {
    if (!value || typeof value!=='object' || Array.isArray(value)) throw Error(`${label} must be an object`);
    for (const k of schema.required||[]) if (!(k in value)) throw Error(`Missing ${k}`);
    for (const [k,v] of Object.entries(value)) {if (!schema.properties[k]) throw Error(`Unknown argument: ${k}`);validate(v,schema.properties[k],k);}
  } else if (schema.type==='string') {
    if (typeof value!=='string' || (schema.minLength && !value.trim()) || value.length>(schema.maxLength||Infinity)) throw Error(`Invalid ${label}`);
  } else if (schema.type==='array') {
    if (!Array.isArray(value) || value.length<(schema.minItems||0) || value.length>(schema.maxItems||Infinity)) throw Error(`Invalid ${label}`);
    value.forEach(v=>validate(v,schema.items,label));
  }
  if (schema.enum && !schema.enum.includes(value)) throw Error(`Invalid ${label}; use one of: ${schema.enum.join(', ')}`);
}
const result = data => ({content:[{type:'text',text:JSON.stringify(data,null,2)}],structuredContent:data});
async function mutate(id,change) {
  const connection = await database();
  connection.exec('BEGIN IMMEDIATE');
  try {
    const current = JSON.parse(connection.prepare('SELECT value FROM issues WHERE id=?').get(id)?.value || '{"status":"Todo"}');
    const next=change(current);next.updatedAt=new Date().toISOString();
    connection.prepare('INSERT INTO issues(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id,JSON.stringify(next));
    connection.exec('COMMIT');return {id,...next};
  } catch(error) {connection.exec('ROLLBACK');throw error;}
}
async function call(name,args) {
  const tool=tools.find(t=>t.name===name);
  if (!tool) throw Error(`Unknown tool for ${service}. Use tools/list.`);
  validate(args,tool.inputSchema);
  if (name==='get_design') {
    const markdown=await readFile(new URL('../fixtures/design/coupon-checkout.md',import.meta.url),'utf8');
    const response=result({designAssetId:args.designAssetId,title:'Blossom Bookings coupon checkout',markdown,
      note:'The light and dark screenshots show the Blossom Bookings checkout with BLOSSOM15 applied. Use the design brief for the required coupon behavior.'});
    // Keep the brief and image blocks together in Codex's tool result.
    delete response.structuredContent;
    for (const filename of ['booking-checkout-coupon-applied-light.webp','booking-checkout-coupon-applied-dark.webp']) response.content.push({type:'image',mimeType:'image/webp',data:(await readFile(new URL(`../fixtures/${filename}`,import.meta.url))).toString('base64')});
    return response;
  }
  if (name==='list_issues') {
    const all=await Promise.all(ids.map(issue));
    const items=all.filter(i=>!args.status||i.status===args.status).map(({markdown:_markdown,workflow:_workflow,...summary})=>summary);
    return result({count:items.length,issues:items});
  }
  const item=await issue(args.ticketId);
  if (name==='get_issue') return result(item);
  if (name==='close_issue') return result({id:item.id,previousStatus:item.status,status:'Closed',closed:true,simulated:true,note:'Preview only; no state or external tracker was changed.'});
  return result(await mutate(item.id,current=>{
    if (name==='claim_issue') {
      if (current.status==='In Progress' && current.claimedBy===args.runId) return current;
      if (current.status!=='Ready') throw Error('Ticket is not Ready. Refresh the queue; ask the facilitator to prepare it.');
      return {...current,status:'In Progress',claimedBy:args.runId};
    }
    if (current.claimedBy!==args.runId) throw Error('This run does not own the claim. Use the claiming run ID.');
    if (name==='create_pull_request' && current.pullRequest) return current;
    if (current.status!=='In Progress') throw Error('Ticket must be In Progress. Ask the facilitator to review its state.');
    if ((name==='create_pull_request'||args.status==='Review') && !args.evidence?.length) throw Error('Review requires at least one evidence item.');
    const next={...current,status:args.status||'Review',summary:args.summary,evidence:args.evidence||[]};
    if (name==='create_pull_request') next.pullRequest={number:Number(item.id.slice(3)),title:args.title,state:'draft',simulated:true,url:`https://blossom-bookings.invalid/pull/${item.id.slice(3)}`};
    return next;
  }));
}
// Explicit facilitator actions are separate from the model's tool surface.
if (process.argv[3]) {
  if (service!=='jira-mock' || !['ready','reset'].includes(process.argv[3]) || !ids.includes(process.argv[4])) throw Error('Use jira-mock ready|reset BB-###');
  const id=process.argv[4], item=await issue(id);
  if (process.argv[3]==='ready' && /open (?:product )?decisions?/i.test(item.markdown)) throw Error('Resolve the ticket’s open product decision before making it Ready.');
  console.log(JSON.stringify(await mutate(id,()=>({status:process.argv[3]==='ready'?'Ready':'Todo'}))));
  db?.close();process.exit(0);
}
const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
for await (const line of createInterface({input:process.stdin})) {
  let request;
  try {request=JSON.parse(line);} catch {output({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});continue;}
  if (!request || request.jsonrpc!=='2.0' || typeof request.method!=='string') {output({jsonrpc:'2.0',id:request?.id??null,error:{code:-32600,message:'Invalid request'}});continue;}
  if (request.id===undefined) continue;
  try {
    let response;
    if (request.method==='initialize') {
      const versions=['2024-11-05','2025-03-26','2025-06-18','2025-11-25'];
      response={protocolVersion:versions.includes(request.params?.protocolVersion)?request.params.protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:service,version:'1.0.0'}};
    } else if (request.method==='ping') response={};
    else if (request.method==='tools/list') response={tools};
    else if (request.method==='tools/call') {
      try {response=await call(request.params?.name,request.params?.arguments??{});} catch(error) {response={isError:true,content:[{type:'text',text:error.message}]};}
    } else {output({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Method not found'}});continue;}
    output({jsonrpc:'2.0',id:request.id,result:response});
  } catch {output({jsonrpc:'2.0',id:request.id,error:{code:-32603,message:'Unable to read local workshop data'}});}
}
db?.close();
