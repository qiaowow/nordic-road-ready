import fs from "node:fs/promises";
import {createHash} from "node:crypto";
const items=JSON.parse(await fs.readFile("research/review-2026-09-07-urls.json","utf8"));
await fs.mkdir("source-archive/review-2026-09-07",{recursive:true});
let i=0;const results=[];
await Promise.all(Array.from({length:4},async()=>{while(i<items.length){const s=items[i++];
 try{const r=await fetch(s.url,{signal:AbortSignal.timeout(25000),headers:{"user-agent":"NordicRoadReady-source-archive/1.0"}});if(!r.ok)throw Error("HTTP "+r.status);
 const bytes=Buffer.from(await r.arrayBuffer());if(!bytes.length)throw Error("empty response");
 const ext=(r.headers.get("content-type")||"").includes("pdf")?"pdf":"html";
 const archivePath="source-archive/review-2026-09-07/"+s.id+"."+ext;await fs.writeFile(archivePath,bytes);
 results.push({...s,archivePath,archiveStatus:"snapshot",sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length,httpStatus:r.status,resolvedUrl:r.url,retrievedAt:new Date().toISOString()});
 }catch(e){results.push({...s,archiveStatus:"missing",error:e.message});}
}}));
await fs.writeFile("research/review-2026-09-07-downloads.json",JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(s=>({id:s.id,status:s.archiveStatus,bytes:s.bytes,error:s.error})),null,2));
