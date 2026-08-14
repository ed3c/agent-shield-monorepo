import {EXCHANGE_REQUEST_SCHEMA,validateExchangeRequest,type ExchangeTarget} from "../../../../packages/contracts/src/exchange/index.ts";
import {applyExchange,assertExchangeReceipt,exchangeRequestDigest,rollbackExchange} from "./protocol.ts";
import {assertExchangeTransition} from "./state-machine.ts";

const A="a".repeat(64),B="b".repeat(64),C="c".repeat(64),D="d".repeat(64),E="e".repeat(64);
function ok(v:unknown,m:string):asserts v{if(!v)throw new Error(`RT-XCHG ${m}`)}
function red(f:()=>unknown,m:string){let x=false;try{f()}catch{x=true}ok(x,`${m} stayed green`)}
const target=(x:Partial<ExchangeTarget>={}):ExchangeTarget=>({id:"workspace-source",digest:A,generation:4,policyEpoch:null,recordCount:null,bindings:[],...x});
function request():Record<string,unknown>{return{
  schema:EXCHANGE_REQUEST_SCHEMA,requestId:"rt-xchg-source",sourceEnvironment:"cloud",targetEnvironment:"local",dataClass:"source",
  lease:{id:"lease-source-1",owner:"worker-source",branch:"feat/source-change",baseDigest:A,allowedPaths:["services/example"],expiresAtEpochMs:10000},
  target:target(),payload:{class:"source",base:{repository:"https://github.com/ed3c/agent-shield-monorepo",commit:"1".repeat(40),tree:"2".repeat(40),digest:A},
    patch:{format:"git-patch",sha256:B,touchedPaths:["services/example/index.ts"],resultSha256:C}},
  exclusions:["secret-values","sessions","newest-wins"]}};

function source(){
  const q=request(),before=target(),r=applyExchange(q,before,{nowEpochMs:1000});
  ok(r.receipt.outcome==="COMPLETED"&&r.receipt.state==="PASS"&&r.target.digest===C&&r.target.generation===5,"source success");
  ok(before.digest===A&&Object.isFrozen(r.receipt)&&Object.isFrozen(r.target),"mutation or unsealed output");
  assertExchangeReceipt(r.receipt,q);
  ok(exchangeRequestDigest(q)===exchangeRequestDigest(validateExchangeRequest(q)),"canonical digest");
  const back=rollbackExchange(r.receipt,r.target);ok(back.receipt.outcome==="COMPLETED"&&back.target.digest===A,"rollback");
  const moved={...r.target,digest:D,generation:6},refused=rollbackExchange(r.receipt,moved);
  ok(refused.receipt.outcome==="ROLLBACK_REFUSED_DRIFT"&&refused.target.digest===D,"drift rollback");
  ok(applyExchange(q,target(),{nowEpochMs:10000}).receipt.outcome==="LEASE_CONFLICT","expired lease");
  ok(applyExchange(q,{...target(),digest:D},{nowEpochMs:1000}).receipt.outcome==="BASE_DRIFT","base drift");
  ok(applyExchange(q,{...target(),id:"other"},{nowEpochMs:1000}).receipt.outcome==="ABSENT_BASE","absent base");
  const p=structuredClone(q);(((p.payload as any).patch).touchedPaths)=["packages/private/x.ts"];
  ok(applyExchange(p,target(),{nowEpochMs:1000}).receipt.outcome==="PATH_CONFLICT","path escape");
}
function contractControls(){
  for(const [k,v] of [["conflictResolution","newest"],["preferCloud",true],["liveTunnel","required"]] as const){
    const q=request();q[k]=v;red(()=>validateExchangeRequest(q),k)}
  const mismatch=request();mismatch.dataClass="secret";red(()=>validateExchangeRequest(mismatch),"class mismatch");
  const overlap=request();(overlap.lease as any).allowedPaths=["services","services/example"];red(()=>validateExchangeRequest(overlap),"overlap");
  const inherited=Object.create(request());inherited.schema=EXCHANGE_REQUEST_SCHEMA;red(()=>validateExchangeRequest(inherited),"inherited request");
  red(()=>assertExchangeTransition("UNRESOLVED","APPLIED"),"transition skip");
}
function otherClasses(){
  const art=request();art.requestId="artifact";art.dataClass="artifact";art.payload={class:"artifact",artifact:{kind:"report",sha256:D,bytes:42,mediaType:"application/json"}};
  const ar=applyExchange(art,target(),{nowEpochMs:1000});ok(ar.receipt.transport==="content-addressed-object"&&ar.target.digest===D,"artifact");
  const path=structuredClone(art);(path.payload as any).artifact.path="/tmp/x";red(()=>validateExchangeRequest(path),"artifact path");

  const img=request();img.requestId="image";img.dataClass="image";img.payload={class:"image",image:{kind:"template",id:"runtime-template",platform:"linux/arm64",sha256:E}};
  ok(applyExchange(img,target(),{nowEpochMs:1000}).receipt.transport==="image-rebuild","image");

  const pt=target({id:"policy-target",policyEpoch:7}),pol=request();pol.requestId="policy";pol.dataClass="policy";pol.target=pt;
  (pol.lease as any).id="lease-policy";pol.payload={class:"policy",policy:{schema:"agent-policy/v1",previousEpoch:7,epoch:8,sha256:D}};
  const pr=applyExchange(pol,pt,{nowEpochMs:1000});ok(pr.target.policyEpoch===8,"policy");
  const stale=structuredClone(pol);(stale.payload as any).policy.previousEpoch=6;
  ok(applyExchange(stale,pt,{nowEpochMs:1000}).receipt.outcome==="POLICY_REFUSED","stale policy");

  const dt=target({id:"data-target",recordCount:10}),data=request();data.requestId="data";data.dataClass="data";data.target=dt;
  data.payload={class:"data",data:{snapshotSha256:B,eventLogSha256:C,invariantSha256:D,resultSha256:E,expectedRecords:14,replayedRecords:14}};
  const dr=applyExchange(data,dt,{nowEpochMs:1000});ok(dr.target.recordCount===14&&dr.receipt.lifecycle.includes("REPLAYED"),"data replay");
  const short=structuredClone(data);(short.payload as any).data.replayedRecords=13;
  const fail=applyExchange(short,dt,{nowEpochMs:1000});ok(fail.receipt.outcome==="REPLAY_FAILED"&&fail.target.recordCount===10,"partial replay");
  const rootOnly=structuredClone(data);delete (rootOnly.payload as any).data.eventLogSha256;red(()=>validateExchangeRequest(rootOnly),"root-only recovery");
}
function brokers(){
  const sec=request();sec.requestId="secret";sec.dataClass="secret";sec.payload={class:"secret",secret:{brokerRef:"openbao:agent/item",bindingId:"runtime-secret"}};
  const sr=applyExchange(sec,target(),{nowEpochMs:1000});
  ok(sr.receipt.transport==="secret-broker-binding"&&sr.target.bindings.includes("secret/runtime-secret"),"secret binding");
  const leak=structuredClone(sec);(leak.payload as any).secret.value="raw";red(()=>validateExchangeRequest(leak),"secret value");
  const file=structuredClone(sec);(file.payload as any).secret.brokerRef="file:/tmp/secret";red(()=>validateExchangeRequest(file),"file secret");

  const ses=request();ses.requestId="session";ses.dataClass="session";ses.payload={class:"session",session:{brokerRef:"session-broker:ios/device-1",bindingId:"device-session",sessionClass:"device"}};
  const rr=applyExchange(ses,target(),{nowEpochMs:1000});
  ok(rr.receipt.transport==="session-broker-binding"&&rr.target.bindings.includes("session/device/device-session"),"session binding");
}
source();contractControls();otherClasses();brokers();
