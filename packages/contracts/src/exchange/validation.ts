import {
  EXCHANGE_REQUEST_SCHEMA,
  type ExchangeArtifact,
  type ExchangeClass,
  type ExchangeEnvironment,
  type ExchangeLease,
  type ExchangePayload,
  type ExchangeRequest,
  type ExchangeTarget,
} from "./types.ts";

const SHA=/^[a-f0-9]{64}$/, OID=/^[a-f0-9]{40}$/, ID=/^[a-z0-9][a-z0-9._/-]{0,127}$/,
  BRANCH=/^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/, MEDIA=/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i;
const classes:ExchangeClass[]=["source","artifact","policy","image","data","secret","session"];
const envs:ExchangeEnvironment[]=["local","cloud"];
const badKeys=new Set(["__proto__","prototype","constructor"]);

function fail(s:string):never{throw new Error(`invalid exchange contract: ${s}`)}
function rec(v:unknown,n:string):Record<string,unknown>{
  if(v===null||typeof v!=="object"||Array.isArray(v))fail(`${n} must be an object`);
  const p=Object.getPrototypeOf(v);if(p!==Object.prototype&&p!==null)fail(`${n} must be plain`);
  for(const k of Object.keys(v))if(badKeys.has(k))fail(`${n}.${k} is forbidden`);
  return v as Record<string,unknown>;
}
function exact(v:Record<string,unknown>,ks:string[],n:string){
  const a=new Set(ks);for(const k of Object.keys(v))if(!a.has(k))fail(`${n}.${k} is not allowed`);
  for(const k of ks)if(!Object.hasOwn(v,k))fail(`${n}.${k} is required`);
}
function s(v:unknown,n:string,p?:RegExp,max=512):string{
  if(typeof v!=="string"||!v||v.length>max||/\p{Cc}/u.test(v)||p&&!p.test(v))fail(`${n} is invalid`);
  return v;
}
function num(v:unknown,n:string,positive=false):number{
  if(typeof v!=="number"||!Number.isSafeInteger(v)||v<0||positive&&v===0)fail(`${n} is invalid`);
  return v;
}
function en<T extends string>(v:unknown,n:string,a:readonly T[]):T{
  if(typeof v!=="string"||!a.includes(v as T))fail(`${n} is invalid`);return v as T;
}
function paths(v:unknown,n:string,max=512):string[]{
  if(!Array.isArray(v)||v.length>max)fail(`${n} is invalid`);
  const out=v.map((x,i)=>{const p=s(x,`${n}[${i}]`,undefined,255);
    if(p.startsWith("/")||p.startsWith("~")||p.includes("\\")||p.includes(":")||/^[A-Za-z]:/.test(p)||
      p.split("/").some(q=>!q||q==="."||q===".."))fail(`${n}[${i}] is not relative`);return p});
  if(new Set(out).size!==out.length)fail(`${n} has duplicates`);return out.sort();
}
function ids(v:unknown,n:string,max=128):string[]{
  if(!Array.isArray(v)||v.length>max)fail(`${n} is invalid`);
  const out=v.map((x,i)=>s(x,`${n}[${i}]`,ID,128));if(new Set(out).size!==out.length)fail(`${n} has duplicates`);
  return out.sort();
}
function target(v:unknown):ExchangeTarget{
  const o=rec(v,"target");exact(o,["id","digest","generation","policyEpoch","recordCount","bindings"],"target");
  return {id:s(o.id,"target.id",ID,128),digest:s(o.digest,"target.digest",SHA,64),
    generation:num(o.generation,"target.generation"),
    policyEpoch:o.policyEpoch===null?null:num(o.policyEpoch,"target.policyEpoch"),
    recordCount:o.recordCount===null?null:num(o.recordCount,"target.recordCount"),bindings:ids(o.bindings,"target.bindings")};
}
function lease(v:unknown):ExchangeLease{
  const o=rec(v,"lease");exact(o,["id","owner","branch","baseDigest","allowedPaths","expiresAtEpochMs"],"lease");
  const a=paths(o.allowedPaths,"lease.allowedPaths",256);if(!a.length)fail("lease.allowedPaths is empty");
  for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)
    if(a[i]===a[j]||a[i].startsWith(`${a[j]}/`)||a[j].startsWith(`${a[i]}/`))fail("lease paths overlap");
  return {id:s(o.id,"lease.id",ID,128),owner:s(o.owner,"lease.owner",ID,128),
    branch:s(o.branch,"lease.branch",BRANCH,255),baseDigest:s(o.baseDigest,"lease.baseDigest",SHA,64),
    allowedPaths:a,expiresAtEpochMs:num(o.expiresAtEpochMs,"lease.expiresAtEpochMs",true)};
}
function repo(v:unknown):string{
  const x=s(v,"payload.base.repository",undefined,512);let u:URL;try{u=new URL(x)}catch{fail("repository is invalid")}
  if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
    !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(u.pathname))fail("repository is not portable");
  return x;
}
function broker(v:unknown,n:string):string{
  const x=s(v,n,undefined,320);if(!/^[a-z][a-z0-9.-]{0,63}:[A-Za-z0-9._/-]{1,255}$/.test(x)||
    x.includes("://")||x.includes("..")||x.includes("\\")||x.startsWith("file:"))fail(`${n} is not opaque`);
  return x;
}
function payload(v:unknown):ExchangePayload{
  const o=rec(v,"payload"),c=en(o.class,"payload.class",classes);
  if(c==="source"){exact(o,["class","base","patch"],"payload");const b=rec(o.base,"payload.base"),p=rec(o.patch,"payload.patch");
    exact(b,["repository","commit","tree","digest"],"payload.base");exact(p,["format","sha256","touchedPaths","resultSha256"],"payload.patch");
    if(p.format!=="git-patch")fail("patch format is invalid");
    return {class:c,base:{repository:repo(b.repository),commit:s(b.commit,"commit",OID,40),tree:s(b.tree,"tree",OID,40),digest:s(b.digest,"base digest",SHA,64)},
      patch:{format:"git-patch",sha256:s(p.sha256,"patch digest",SHA,64),touchedPaths:paths(p.touchedPaths,"touchedPaths"),resultSha256:s(p.resultSha256,"result digest",SHA,64)}}}
  if(c==="artifact"){exact(o,["class","artifact"],"payload");const a=rec(o.artifact,"artifact");exact(a,["kind","sha256","bytes","mediaType"],"artifact");
    return {class:c,artifact:{kind:s(a.kind,"artifact.kind",ID,128),sha256:s(a.sha256,"artifact.sha256",SHA,64),bytes:num(a.bytes,"artifact.bytes"),mediaType:s(a.mediaType,"artifact.mediaType",MEDIA,255)}}}
  if(c==="policy"){exact(o,["class","policy"],"payload");const p=rec(o.policy,"policy");exact(p,["schema","previousEpoch","epoch","sha256"],"policy");
    return {class:c,policy:{schema:s(p.schema,"policy.schema",ID,128),previousEpoch:num(p.previousEpoch,"previousEpoch"),epoch:num(p.epoch,"epoch",true),sha256:s(p.sha256,"policy.sha256",SHA,64)}}}
  if(c==="image"){exact(o,["class","image"],"payload");const i=rec(o.image,"image");exact(i,["kind","id","platform","sha256"],"image");
    return {class:c,image:{kind:en(i.kind,"image.kind",["image","template"] as const),id:s(i.id,"image.id",ID,128),platform:s(i.platform,"platform",undefined,128),sha256:s(i.sha256,"image.sha256",SHA,64)}}}
  if(c==="data"){exact(o,["class","data"],"payload");const d=rec(o.data,"data");exact(d,["snapshotSha256","eventLogSha256","invariantSha256","resultSha256","expectedRecords","replayedRecords"],"data");
    return {class:c,data:{snapshotSha256:s(d.snapshotSha256,"snapshot",SHA,64),eventLogSha256:s(d.eventLogSha256,"event log",SHA,64),invariantSha256:s(d.invariantSha256,"invariant",SHA,64),resultSha256:s(d.resultSha256,"result",SHA,64),expectedRecords:num(d.expectedRecords,"expectedRecords"),replayedRecords:num(d.replayedRecords,"replayedRecords")}}}
  if(c==="secret"){exact(o,["class","secret"],"payload");const x=rec(o.secret,"secret");exact(x,["brokerRef","bindingId"],"secret");
    return {class:c,secret:{brokerRef:broker(x.brokerRef,"secret.brokerRef"),bindingId:s(x.bindingId,"bindingId",ID,128)}}}
  exact(o,["class","session"],"payload");const x=rec(o.session,"session");exact(x,["brokerRef","bindingId","sessionClass"],"session");
  return {class:"session",session:{brokerRef:broker(x.brokerRef,"session.brokerRef"),bindingId:s(x.bindingId,"bindingId",ID,128),sessionClass:en(x.sessionClass,"sessionClass",["browser","device"] as const)}};
}
export function validateExchangeRequest(v:unknown):ExchangeRequest{
  const o=rec(v,"request");exact(o,["schema","requestId","sourceEnvironment","targetEnvironment","dataClass","lease","target","payload","exclusions"],"request");
  if(o.schema!==EXCHANGE_REQUEST_SCHEMA)fail("schema is unsupported");
  const se=en(o.sourceEnvironment,"sourceEnvironment",envs),te=en(o.targetEnvironment,"targetEnvironment",envs);if(se===te)fail("environments must differ");
  const dc=en(o.dataClass,"dataClass",classes),pl=payload(o.payload);if(dc!==pl.class)fail("data class mismatch");
  return {schema:EXCHANGE_REQUEST_SCHEMA,requestId:s(o.requestId,"requestId",ID,128),sourceEnvironment:se,targetEnvironment:te,
    dataClass:dc,lease:lease(o.lease),target:target(o.target),payload:pl,exclusions:ids(o.exclusions,"exclusions",64)};
}
export const validateExchangeTarget=target;
export function exchangeArtifact(kind:string,sha256:string,bytes:number|null,mediaType:string):ExchangeArtifact{
  s(kind,"artifact kind",ID,128);s(sha256,"artifact digest",SHA,64);if(bytes!==null)num(bytes,"artifact bytes");s(mediaType,"artifact media",MEDIA,255);
  return {kind,sha256,bytes,mediaType};
}
