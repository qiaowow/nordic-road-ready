import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
const sources=JSON.parse(await fs.readFile("data/sources.json","utf8"));
const assets=JSON.parse(await fs.readFile("data/assets.json","utf8"));
const records=[];
for(const s of sources){
 const [file,anchor]=s.archivePath.split("#");const resolved=path.resolve(file);
 if(!resolved.startsWith(process.cwd()+path.sep))throw Error("Archive path outside project");
 try{const data=await fs.readFile(file);const hash=createHash("sha256").update(data).digest("hex");records.push({id:s.id,path:file,anchor:anchor||null,kind:s.archiveStatus,bytes:data.length,sha256:hash,recordedHashMatches:hash.toLowerCase()===s.sha256.toLowerCase()});}
 catch{records.push({id:s.id,path:file,anchor:anchor||null,kind:"missing",sha256:null,bytes:0});}
}
const originals=[];
for(const a of assets.filter(a=>a.originalArchivePath)){const data=await fs.readFile(a.originalArchivePath);originals.push({id:a.id,path:a.originalArchivePath,sha256:createHash("sha256").update(data).digest("hex"),bytes:data.length});}
await fs.writeFile("data/evidence-index.json",JSON.stringify({checkedAt:new Date().toISOString(),records,originals},null,2));
console.log(JSON.stringify({sources:records.length,missing:records.filter(x=>x.kind==="missing").map(x=>x.id),oldFingerprintDifferent:records.filter(x=>x.kind!=="missing"&&!x.recordedHashMatches).length,originalAssets:originals.length}));
