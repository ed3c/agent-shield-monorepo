#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record=value as Record<string,unknown>;
  return `{${Object.keys(record).sort().map((key)=>`${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}
function sha(value:string|Buffer):string{return createHash("sha256").update(value).digest("hex")}
function readJson(path:string):any{return JSON.parse(readFileSync(path,"utf8"))}
function withDigest<T extends Record<string,unknown>>(value:T):T&{content_sha256:string}{return {...value,content_sha256:sha(canonical(value))}}

const root=resolve(".");
const modules=readdirSync(join(root,".arena/modules")).sort().map((id)=>{
  const path=join(root,".arena/modules",id,"module.json"),value=readJson(path);
  if(value.schema!=="agent-shield/module/v1"||value.id!==id)throw new Error(`invalid module ${id}`);
  return {
    id,
    interface_version:value.interface_version,
    manifest_sha256:sha(canonical(value)),
    roots:[...value.roots].sort(),
    provides:[...value.provides].sort(),
    requires:[...value.requires].sort(),
    runtime:value.runtime,
    external_exposed:value.external_policy.exposed
  };
});
const contractFiles=["packages/contracts/src/index.ts","data/status/integration.json","AGENTS.md","CLAUDE.md","ARCHITECTURE.md"];
const contracts=contractFiles.map((path)=>({path,sha256:sha(readFileSync(join(root,path)))}));
const unsigned={
  schema:"agent-shield/module-release/v1",
  release:"agent-shield-module-set@0.1.0",
  runtime:"bun-typescript",
  modules,
  contracts,
  live_state:"NOT_EXERCISED",
  note:"The manifest binds portable module and contract bytes. Git commit/tree, origin reachability, bettor consumption, providers, devices, browsers, hardware, and settlement require separate receipts."
};
const output=withDigest(unsigned);
const arg=process.argv.indexOf("--output"),target=arg>=0&&process.argv[arg+1]?resolve(process.argv[arg+1]):join(root,"data/releases/agent-shield-module-set.json");
writeFileSync(target,`${JSON.stringify(output,null,2)}\n`);
console.log(`PASS module release ${output.release} ${output.content_sha256}`);
