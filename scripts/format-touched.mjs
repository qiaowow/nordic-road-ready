import ts from "typescript";
import {readFile,writeFile} from "node:fs/promises";
// Uses the existing compiler; no formatter download is needed.
for(const file of process.argv.slice(2)){
 const input=await readFile(file,"utf8");
 const tree=ts.createSourceFile(file,input,ts.ScriptTarget.Latest,true,file.endsWith(".tsx")?ts.ScriptKind.TSX:file.endsWith(".ts")?ts.ScriptKind.TS:ts.ScriptKind.JS);
 const output=ts.createPrinter({newLine:ts.NewLineKind.LineFeed}).printFile(tree);
 await writeFile(file,output);console.log("Formatted "+file);
}
