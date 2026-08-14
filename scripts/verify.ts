#!/usr/bin/env bun
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { evidenceParityRefusals } from "./evidence-parity.ts";
const root=process.cwd();
const moduleRoot=join(root,".arena/modules");
const expected=["bettor-consumer","document-ingest","product-adapters","research-orchestrator","runtime-fabric","security-boundaries"];
for(const id of expected){
 const path=join(moduleRoot,id,"module.json"),value=JSON.parse(readFileSync(path,"utf8"));
 if(value.schema!=="agent-shield/module/v1"||value.id!==id||!Array.isArray(value.roots)||!value.external_policy)throw new Error(`module invalid: ${id}`);
 for(const owned of value.roots){const full=join(root,owned);if(!statSync(full))throw new Error(`module root absent: ${owned}`);}
}
const owner=new Map<string,string>();
for(const id of expected){const value=JSON.parse(readFileSync(join(moduleRoot,id,"module.json"),"utf8"));for(const owned of value.roots){if(owner.has(owned))throw new Error(`duplicate module root: ${owned}`);owner.set(owned,id);}}
const forbidden=[...(["ANTHROPIC_API_KEY","OPENAI_API_KEY","E2B_API_KEY","GITHUB_TOKEN","FORGEJO_TOKEN"].map((value)=>`${value}=`)),`/${"Users"}/`,`${"~"}/`];
function walk(path:string):void{for(const name of readdirSync(path)){if([".git","node_modules"].includes(name))continue;const file=join(path,name),info=statSync(file);if(info.isDirectory())walk(file);else{const text=readFileSync(file,"utf8");for(const token of forbidden)if(text.includes(token))throw new Error(`forbidden material ${token} in ${file}`);}}}
walk(root);
const parity=evidenceParityRefusals(root);if(parity.refusals.length>0)throw new Error(`evidence parity refused:\n  ${parity.refusals.join("\n  ")}`);
console.log(`PASS Agent Shield modular contract (${expected.length} modules, evidence parity clean)`);
