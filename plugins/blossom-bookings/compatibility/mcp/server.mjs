import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
const specs = [
  {name:'list_blossom_issues', description:'List fictional Bookings workshop tickets', inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'get_blossom_issue', description:'Read a fictional Bookings ticket', inputSchema:{type:'object',properties:{ticketId:{type:'string',enum:['BB-142','BB-241','BB-242','BB-412','BB-998','BB-999']}},required:['ticketId'],additionalProperties:false}},
  {name:'get_blossom_design', description:'Read the approved coupon checkout design', inputSchema:{type:'object',properties:{},additionalProperties:false}},
];
const ids = specs[1].inputSchema.properties.ticketId.enum;
const output = value => process.stdout.write(JSON.stringify(value)+'\n');
for await (const line of createInterface({input:process.stdin})) {
  let request;
  try { request=JSON.parse(line); } catch { output({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}}); continue; }
  if (request.id === undefined) continue;
  try {
    let result;
    switch(request.method) {
      case 'initialize': result={protocolVersion:request.params?.protocolVersion ?? '2024-11-05', capabilities:{tools:{}},serverInfo:{name:'blossom-bookings',version:'1.0.0'}}; break;
      case 'ping': result={}; break;
      case 'tools/list': result={tools:specs}; break;
      case 'tools/call': {
        const {name,arguments:args={}} = request.params ?? {};
        let text;
        if (name==='list_blossom_issues') text=ids.join('\n');
        else if (name==='get_blossom_issue' && ids.includes(args.ticketId)) text=await readFile(new URL(`../../fixtures/issues/${args.ticketId}.md`,import.meta.url),'utf8');
        else if (name==='get_blossom_design') text=await readFile(new URL('./coupon-checkout.md',import.meta.url),'utf8');
        else { result={content:[{type:'text',text:'Unknown tool or ticket'}],isError:true}; break; }
        result={content:[{type:'text',text}]}; break;
      }
      default: output({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Method not found'}}); continue;
    }
    output({jsonrpc:'2.0',id:request.id,result});
  } catch { output({jsonrpc:'2.0',id:request.id,error:{code:-32603,message:'Unable to read workshop fixture'}}); }
}
