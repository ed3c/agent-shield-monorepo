#!/usr/bin/env bun
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root=process.cwd();
const lockPath=join(root,".arena/consumer.lock.json");
if(!existsSync(lockPath)){
  console.log("NOT_EXERCISED bettor consumer initialization: trusted private bettor checkout was not supplied");
  process.exit(0);
}
const readText=(path:string)=>readFileSync(join(root,path),"utf8");
const readJson=<T>(path:string):T=>JSON.parse(readText(path)) as T;
interface Lock{schema:string;project:string;mode:string;source:{repository:string;commit:string;tree:string};modules:Array<{id:string}>;skills:{shared:string[];repo_owned:string[]};runtime:string;content_sha256:string}
const lock=readJson<Lock>(".arena/consumer.lock.json");
if(lock.schema!=="bettor-arena/consumer-lock/v1"||lock.project!=="agent-shield-monorepo")throw new Error("consumer lock identity drifted");
if(!/^[0-9a-f]{40}$/.test(lock.source.commit)||!/^[0-9a-f]{40}$/.test(lock.source.tree))throw new Error("consumer source is not immutable commit/tree");
if(lock.source.repository!=="https://github.com/ed3c/bettor-arena"||lock.runtime!=="bun-typescript")throw new Error("unexpected bettor source/runtime");
const modules=new Set(lock.modules.map((item)=>item.id));
for(const required of ["environment-contracts","code-truth-graph","technical-equivalence","loop-runtime","project-bootstrapper"])if(!modules.has(required))throw new Error(`consumer closure omits ${required}`);
const launcher=readText(".arena/bin/bettor-mcp");
if(!launcher.includes("exec bun")||!launcher.includes("loopctl/mcp_runtime.ts")||launcher.includes("python3"))throw new Error("generated MCP launcher is not Bun/TypeScript primary");
if(!launcher.includes(lock.source.commit))throw new Error("launcher does not pin lock commit");
if(lstatSync(join(root,".arena/bin/bettor-mcp")).isSymbolicLink())throw new Error("MCP launcher may not be a symlink");
for(const path of [".mcp.json",".codex/config.toml",".agents/shared-skills.requirements.json",".arena/bin/bettor-mcp"]){
 const text=readText(path);for(const token of [["ANTHROPIC","API","KEY"].join("_")+"=",["OPENAI","API","KEY"].join("_")+"=",["E2B","API","KEY"].join("_")+"=","/"+["Users"].join("")+"/","~"+"/"])if(text.includes(token))throw new Error(`forbidden material ${token} in ${path}`);
}
console.log(`PASS bettor consumer integration (${lock.mode}, ${lock.source.commit.slice(0,12)}, ${lock.modules.length} modules)`);
