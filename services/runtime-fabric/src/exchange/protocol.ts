import {createHash} from "node:crypto";
import type {EvidenceState} from "../../../../packages/contracts/src/index.ts";
import {
  EXCHANGE_RECEIPT_SCHEMA,EXCHANGE_ROLLBACK_SCHEMA,exchangeArtifact,validateExchangeRequest,
  validateExchangeTarget,type ExchangeArtifact,type ExchangeClass,type ExchangeOutcome,
  type ExchangePayload,type ExchangeReceipt,type ExchangeRequest,type ExchangeResult,
  type ExchangeRollbackReceipt,type ExchangeTarget,type ExchangeTransport
} from "../../../../packages/contracts/src/exchange/index.ts";
import {ExchangeLifecycle,validateExchangeLifecycle} from "./state-machine.ts";

const canon=(v:unknown):string=>{
  if(v===null||typeof v!=="object"){const x=JSON.stringify(v);if(x===undefined)throw new Error("non-JSON exchange value");return x}
  if(Array.isArray(v))return `[${v.map(canon).join(",")}]`;
  const o=v as Record<string,unknown>;return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`
};
const hash=(v:unknown)=>createHash("sha256").update(canon(v)).digest("hex");
const copy=(t:ExchangeTarget):ExchangeTarget=>({...t,bindings:[...t.bindings]});
function freeze<T>(v:T):T{if(v&&typeof v==="object"&&!Object.isFrozen(v)){for(const x of Object.values(v as Record<string,unknown>))freeze(x);Object.freeze(v)}return v}
const evidence=(o:ExchangeOutcome):EvidenceState=>o==="COMPLETED"?"PASS":o==="ABSENT_BASE"?"ABSENT":"FAIL";
const transport=(c:ExchangeClass):ExchangeTransport=>({
  source:"git-patch",artifact:"content-addressed-object",policy:"policy-epoch",image:"image-rebuild",
  data:"snapshot-event-replay",secret:"secret-broker-binding",session:"session-broker-binding"
})[c] as ExchangeTransport;
const within=(p:string,r:string)=>p===r||p.startsWith(`${r}/`);

function resultDigest(p:ExchangePayload):string{
  switch(p.class){
    case"source":return p.patch.resultSha256;case"artifact":return p.artifact.sha256;
    case"policy":return p.policy.sha256;case"image":return p.image.sha256;case"data":return p.data.resultSha256;
    case"secret":return hash({class:p.class,...p.secret});case"session":return hash({class:p.class,...p.session});
  }
}
function artifacts(p:ExchangePayload):ExchangeArtifact[]{
  switch(p.class){
    case"source":return[exchangeArtifact("source-patch",p.patch.sha256,null,"text/x-diff")];
    case"artifact":return[exchangeArtifact(p.artifact.kind,p.artifact.sha256,p.artifact.bytes,p.artifact.mediaType)];
    case"policy":return[exchangeArtifact("policy",p.policy.sha256,null,"application/vnd.agent-shield.policy+json")];
    case"image":return[exchangeArtifact(p.image.kind,p.image.sha256,null,"application/vnd.oci.image.manifest.v1+json")];
    case"data":return[
      exchangeArtifact("snapshot",p.data.snapshotSha256,null,"application/vnd.agent-shield.snapshot"),
      exchangeArtifact("event-log",p.data.eventLogSha256,null,"application/vnd.agent-shield.event-log"),
      exchangeArtifact("invariant-proof",p.data.invariantSha256,null,"application/vnd.agent-shield.invariant+json"),
      exchangeArtifact("replay-result",p.data.resultSha256,null,"application/vnd.agent-shield.replay+json")];
    case"secret":return[exchangeArtifact("secret-binding",resultDigest(p),null,"application/vnd.agent-shield.binding+json")];
    case"session":return[exchangeArtifact("session-binding",resultDigest(p),null,"application/vnd.agent-shield.binding+json")];
  }
}
function after(r:ExchangeRequest,b:ExchangeTarget):ExchangeTarget{
  const a={...copy(b),digest:resultDigest(r.payload),generation:b.generation+1};
  if(r.payload.class==="policy")a.policyEpoch=r.payload.policy.epoch;
  if(r.payload.class==="data")a.recordCount=r.payload.data.replayedRecords;
  if(r.payload.class==="secret")a.bindings=[...new Set([...a.bindings,`secret/${r.payload.secret.bindingId}`])].sort();
  if(r.payload.class==="session")a.bindings=[...new Set([...a.bindings,`session/${r.payload.session.sessionClass}/${r.payload.session.bindingId}`])].sort();
  return a;
}
function receipt(r:ExchangeRequest,l:ExchangeLifecycle,o:ExchangeOutcome,b:ExchangeTarget,a:ExchangeTarget,detail:string,arts:ExchangeArtifact[]=[],paths:string[]=[]):ExchangeReceipt{
  if(l.current!==o)l.transition(o);validateExchangeLifecycle(l.trace);
  return freeze({schema:EXCHANGE_RECEIPT_SCHEMA,requestId:r.requestId,requestDigest:hash(r),dataClass:r.dataClass,
    sourceEnvironment:r.sourceEnvironment,targetEnvironment:r.targetEnvironment,lifecycle:[...l.trace],outcome:o,
    state:evidence(o),transport:transport(r.dataClass),leaseId:r.lease.id,targetBefore:copy(b),targetAfter:copy(a),
    artifacts:arts.map(x=>({...x})),appliedPaths:[...paths],exclusions:[...r.exclusions],detail});
}
function block(r:ExchangeRequest,t:ExchangeTarget,l:ExchangeLifecycle,o:Exclude<ExchangeOutcome,"COMPLETED"|"ROLLBACK_REFUSED_DRIFT">,d:string):ExchangeResult{
  return freeze({target:copy(t),receipt:receipt(r,l,o,t,t,d)});
}
const same=(a:ExchangeTarget,b:ExchangeTarget)=>canon(a)===canon(b);

export function exchangeRequestDigest(v:unknown):string{return hash(validateExchangeRequest(v))}
export function applyExchange(v:unknown,currentValue:unknown,{nowEpochMs}:{nowEpochMs:number}):ExchangeResult{
  if(!Number.isSafeInteger(nowEpochMs)||nowEpochMs<0)throw new Error("nowEpochMs is invalid");
  const r=freeze(validateExchangeRequest(v)),cur=freeze(validateExchangeTarget(currentValue)),l=new ExchangeLifecycle();
  l.transition("CLASSIFIED");
  if(nowEpochMs>=r.lease.expiresAtEpochMs)return block(r,cur,l,"LEASE_CONFLICT","writer lease expired");
  l.transition("LEASED");
  if(cur.id!==r.target.id)return block(r,cur,l,"ABSENT_BASE","target identity differs");
  if(!same(cur,r.target)||cur.digest!==r.lease.baseDigest||
    r.payload.class==="source"&&r.payload.base.digest!==r.lease.baseDigest)
    return block(r,cur,l,"BASE_DRIFT","immutable base drifted");
  l.transition("BASE_BOUND");
  if(r.payload.class==="source"&&r.payload.patch.touchedPaths.some(p=>!r.lease.allowedPaths.some(x=>within(p,x))))
    return block(r,cur,l,"PATH_CONFLICT","patch escaped its lease");
  if(r.payload.class==="policy"&&(cur.policyEpoch===null||r.payload.policy.previousEpoch!==cur.policyEpoch||
    r.payload.policy.epoch<=r.payload.policy.previousEpoch))
    return block(r,cur,l,"POLICY_REFUSED","policy epoch did not advance");
  l.transition("EXPORTED");const arts=artifacts(r.payload);l.transition("TRANSFERRED");
  if(arts.some(a=>a.sha256==="0".repeat(64)))return block(r,cur,l,"VERIFY_FAILED","zero digest refused");
  l.transition("VERIFIED");const staged=after(r,cur);l.transition("APPLIED");
  if(r.payload.class==="data"){l.transition("REPLAYED");if(r.payload.data.expectedRecords!==r.payload.data.replayedRecords)
    return block(r,cur,l,"REPLAY_FAILED","replayed records do not satisfy the invariant")}
  l.transition("COMPLETED");
  return freeze({target:copy(staged),receipt:receipt(r,l,"COMPLETED",cur,staged,"typed exchange completed",
    arts,r.payload.class==="source"?r.payload.patch.touchedPaths:[])});
}
export function assertExchangeReceipt(x:ExchangeReceipt,v:unknown):void{
  const r=validateExchangeRequest(v);
  if(x.schema!==EXCHANGE_RECEIPT_SCHEMA||x.requestId!==r.requestId||x.requestDigest!==hash(r)||
    x.dataClass!==r.dataClass||x.sourceEnvironment!==r.sourceEnvironment||x.targetEnvironment!==r.targetEnvironment||
    x.leaseId!==r.lease.id||validateExchangeLifecycle(x.lifecycle)!==x.outcome||x.state!==evidence(x.outcome)||
    x.transport!==transport(r.dataClass)||canon(x.exclusions)!==canon(r.exclusions))throw new Error("exchange receipt identity mismatch");
  if(x.outcome==="COMPLETED"&&(x.targetAfter.digest!==resultDigest(r.payload)||
    x.targetAfter.generation!==x.targetBefore.generation+1))throw new Error("exchange receipt result mismatch");
  if(x.outcome!=="COMPLETED"&&!same(x.targetBefore,x.targetAfter))throw new Error("blocked receipt changed target");
}
export function rollbackExchange(x:ExchangeReceipt,currentValue:unknown):{target:ExchangeTarget;receipt:ExchangeRollbackReceipt}{
  if(x.outcome!=="COMPLETED")throw new Error("only completed exchange can roll back");
  const cur=freeze(validateExchangeTarget(currentValue)),drift=!same(cur,x.targetAfter),t=drift?copy(cur):copy(x.targetBefore);
  return freeze({target:t,receipt:{schema:EXCHANGE_ROLLBACK_SCHEMA,requestId:x.requestId,originalRequestDigest:x.requestDigest,
    targetBefore:copy(x.targetAfter),targetObserved:copy(cur),targetAfter:copy(t),
    outcome:drift?"ROLLBACK_REFUSED_DRIFT":"COMPLETED",state:drift?"FAIL":"PASS",
    detail:drift?"rollback refused after downstream drift":"exact pre-exchange subject restored"}});
}
