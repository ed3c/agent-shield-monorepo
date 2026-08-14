#!/usr/bin/env bun
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ingest } from "../services/document-ingest/src/index.ts";
import { routeResearch } from "../services/research-orchestrator/src/index.ts";
import { providerReceipt } from "../services/runtime-fabric/src/index.ts";
import { runtimeFoundationSelftest } from "../services/runtime-fabric/src/state-machine/selftest.ts";
import { adapterReceipt } from "../services/mobile-automation/src/index.ts";
import { securityCapabilities, validateIntent } from "../services/security-boundaries/src/index.ts";
import { decide } from "../services/intent-ledger/src/index.ts";
import { subject } from "../packages/agent-shield-sdk/src/index.ts";
import { integrationStatusRefusals } from "./integration-status.ts";
const root=mkdtempSync(join(tmpdir(),"agent-shield-selftest-"));
try{
 const text=join(root,"input.txt");writeFileSync(text,"hello modular agent shield\n");
 const pass=ingest({path:text,mediaType:"text/plain",provider:"local"});if(pass.state!=="PASS")throw new Error("text ingest did not pass");
 const pdf=join(root,"input.pdf");writeFileSync(pdf,"%PDF-1.7 fixture");if(ingest({path:pdf,mediaType:"application/pdf",provider:"local"}).state!=="NOT_IMPLEMENTED")throw new Error("PDF absence hidden");
 if(routeResearch({workflow:"external-verify",inputRef:pass.artifacts[0],environment:"cloud"}).state!=="PASS")throw new Error("raw-primary route failed");
 if(routeResearch({workflow:"gemini-conversation-research",inputRef:pass.artifacts[0],environment:"cloud"}).state!=="NOT_IMPLEMENTED")throw new Error("cloud GCR overclaimed");
 if(providerReceipt("local-disposable-worktree").state!=="PASS"||providerReceipt("e2b-firecracker").state!=="NOT_IMPLEMENTED")throw new Error("runtime provider states drifted");
 if(adapterReceipt("maestro").state!=="NOT_EXERCISED"||adapterReceipt("cloud-ios").state!=="NOT_IMPLEMENTED")throw new Error("product adapter states drifted");
 // The epics delegate their state to data/status/integration.json, so it must equal what the
 // receipts emit. Editing either side alone is now red; before this it was silent.
 const published=JSON.parse(readFileSync(join(process.cwd(),"data/status/integration.json"),"utf8"));
 const drift=integrationStatusRefusals(published);if(drift.length>0)throw new Error(`published integration status drifted:\n  ${drift.join("\n  ")}`);
 validateIntent({target:"0xfixture",amountMinor:1n,currency:"USDC",evidenceRefs:["evidence-1"]});
 if(securityCapabilities.some((item)=>item.state!=="NOT_IMPLEMENTED"))throw new Error("native security provider overclaimed");
 if(decide({id:"i1",target:"vendor",amountMinor:10n,evidence:["e1"]}).state!=="PASS")throw new Error("deterministic intent failed");
 if(decide({id:"i2",target:"vendor",amountMinor:1_000_000n,evidence:["e1"]}).state!=="FAIL")throw new Error("human boundary missing");
 subject("https://github.com/ed3c/bettor-arena","a".repeat(40),"loopctl_ctg_run");
 let red=false;try{subject("https://github.com/ed3c/bettor-arena","main","loopctl_ctg_run")}catch{red=true}if(!red)throw new Error("mutable bettor ref accepted");
 await runtimeFoundationSelftest();
 console.log("SELFTEST GREEN: Agent Shield phased contracts + RT-FND");
}finally{rmSync(root,{recursive:true,force:true});}
