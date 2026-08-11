#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function value(args:string[],name:string):string { const i=args.indexOf(name); if(i<0||!args[i+1]) throw new Error(`${name} required`); return args[i+1]; }
const args=process.argv.slice(2);
const bettorRoot=resolve(value(args,"--bettor-root"));
const commit=value(args,"--commit");
const mode=(args.includes("--embedded")?"embedded-core":"remote-consumer") as "embedded-core"|"remote-consumer";
if(!/^[0-9a-f]{40}$/.test(commit)) throw new Error("--commit must be immutable 40-hex");
const root=resolve(".");
const requirements={
  schema:"bettor-arena/project-requirements/v1",
  id:"agent-shield-monorepo",
  mode,
  release:{repository:"https://github.com/ed3c/bettor-arena",commit},
  preset:mode === "embedded-core" ? "embedded-core" : "consumer-core",
  modules:[
    {id:"environment-contracts",components:["browser","origins","proof"]},
    {id:"code-truth-graph",components:["proof","runtime"]},
    {id:"technical-equivalence",components:["proof","runtime"]}
  ]
};
mkdirSync(`${root}/.arena/bootstrap`,{recursive:true});
const req=`${root}/.arena/bootstrap/bettor.requirements.json`,plan=`${root}/.arena/bootstrap/bettor.plan.json`;
writeFileSync(req,`${JSON.stringify(requirements,null,2)}\n`);
let result=spawnSync("bun",[`${bettorRoot}/scripts/arena_project.ts`,"--source",bettorRoot,"plan","--target",root,"--requirements",req,"--output",plan],{stdio:"inherit"});
if(result.status!==0)process.exit(result.status??64);
if(args.includes("--apply")){
  result=spawnSync("bun",[`${bettorRoot}/scripts/arena_project.ts`,"--source",bettorRoot,"apply","--target",root,"--plan",plan],{stdio:"inherit"});
  if(result.status!==0)process.exit(result.status??64);
}else console.log(`PLAN ONLY: ${plan}`);
