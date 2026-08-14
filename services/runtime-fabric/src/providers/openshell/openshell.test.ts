import {
  OPENSHELL_POLICY_REQUEST_SCHEMA,
  compileOpenShellPolicy,
  openShellDynamicDigest,
  openShellStaticDigest,
  validateOpenShellPolicyRequest,
} from "./index.ts";

const A="a".repeat(64),B="b".repeat(64);
function ok(value:unknown,message:string):asserts value{if(!value)throw new Error(`RT-OS ${message}`)}
function red(action:()=>unknown,message:string){let failed=false;try{action()}catch{failed=true}ok(failed,`${message} stayed green`)}
function runtime(){return{
 schema:"agent-shield/runtime-request/v1",requestId:"runtime-openshell",providerId:"fixture-provider",scope:"local",
 requiredCapabilities:["fixture.echo"],source:{kind:"git",repository:"https://github.com/ed3c/agent-shield-monorepo",commit:"1".repeat(40),tree:"2".repeat(40)},
 workload:{id:"fixture.echo",version:"1.0.0",input:{value:"hello"}},environment:{allowedVariables:[]},
 network:{mode:"deny-all",allowlist:[]},secrets:[],limits:{timeoutMs:1000,cancellationGraceMs:100,maxInputBytes:1024,maxOutputBytes:4096,maxArtifactBytes:4096,maxTouchedPaths:8},
 mutation:{writableRoots:["workspace/output"],readOnlyRoots:["workspace/input"]},
 artifacts:[{kind:"log",required:true,maxBytes:1024,mediaTypes:["text/plain"]}],
 cleanup:{processCleanup:"required",workspaceCleanup:"delete",sessionCleanup:"required",maxDurationMs:1000},
 exclusions:["live-openshell","credentials","production"]};}
function request(): any{return{
 schema:OPENSHELL_POLICY_REQUEST_SCHEMA,requestId:"rt-os-policy",runtimeRequest:runtime(),
 upstream:{repository:"https://github.com/NVIDIA/OpenShell",commit:"c4b500a7de64d0b66e3ee8098f58d14299092162",license:"Apache-2.0",policySchemaVersion:1,channel:"dev-prerelease",artifactAdmission:"NOT_EXERCISED"},
 policyEpoch:{previous:0,current:1},previous:null,workspaceRoot:"/sandbox",
 filesystem:{includeWorkdir:false,readOnly:["/app","/dev/urandom","/etc","/lib","/proc","/sandbox/input","/usr","/var/log"],readWrite:["/dev/null","/sandbox/output","/tmp"],landlockCompatibility:"best_effort"},
 processProfile:{id:"openshell-process-baseline",sha256:A},networkPolicies:[],inferenceProfile:null,credentialBindings:[],
 exclusions:["external-runtime","provider-credentials","runtime-attach"]};}

function positive(){
 const value=request(),envelope=compileOpenShellPolicy(value);
 ok(envelope.outcome==="COMPLETED"&&envelope.state==="PASS"&&envelope.externalRuntimeState==="NOT_EXERCISED","positive state");
 ok(envelope.reloadMode==="CREATE_REQUIRED"&&envelope.document?.version===1,"creation mode");
 ok(envelope.document?.filesystem_policy.read_write.includes("/sandbox/output"),"filesystem document");
 ok(Object.isFrozen(envelope)&&Object.isFrozen(envelope.document),"unsealed envelope");
}
function hotReload(){
 const first=request(),initial=compileOpenShellPolicy(first);
 const next=request();next.requestId="rt-os-policy-2";next.policyEpoch={previous:1,current:2};
 next.previous={epoch:1,staticDigest:initial.staticDigest!,dynamicDigest:initial.dynamicDigest!};
 next.runtimeRequest.network={mode:"allowlist",allowlist:["api.github.com:443"]};
 next.networkPolicies=[{id:"github-api",name:"github-api-readonly",endpoints:[{host:"api.github.com",port:443,protocol:"rest",enforcement:"enforce",access:"read-only"}],binaries:["/usr/bin/curl"]}];
 const updated=compileOpenShellPolicy(next);
 ok(updated.reloadMode==="HOT_RELOAD_DYNAMIC"&&updated.document?.network_policies["github-api"].endpoints[0].access==="read-only","dynamic hot reload");
 const same=request();same.requestId="rt-os-policy-3";same.policyEpoch={previous:1,current:2};same.previous={epoch:1,staticDigest:initial.staticDigest!,dynamicDigest:initial.dynamicDigest!};
 ok(compileOpenShellPolicy(same).reloadMode==="NO_CHANGE","no-change classification");
 const recreated=request();recreated.requestId="rt-os-policy-4";recreated.policyEpoch={previous:1,current:2};recreated.previous={epoch:1,staticDigest:initial.staticDigest!,dynamicDigest:initial.dynamicDigest!};
 recreated.filesystem.readWrite=["/dev/null","/sandbox/cache","/sandbox/output","/tmp"];
 ok(compileOpenShellPolicy(recreated).reloadMode==="CREATE_REQUIRED","static change hot reloaded");
}
function refusals(){
 const stale=request();stale.policyEpoch={previous:1,current:2};stale.previous={epoch:0,staticDigest:A,dynamicDigest:B};
 ok(compileOpenShellPolicy(stale).outcome==="STALE_EPOCH","stale epoch");
 const network=request();network.runtimeRequest.network={mode:"allowlist",allowlist:["api.github.com:443"]};
 ok(compileOpenShellPolicy(network).outcome==="REFUSED_NETWORK","network widening");
 const filesystem=request();filesystem.runtimeRequest.mutation.writableRoots=["workspace/private"];
 ok(compileOpenShellPolicy(filesystem).outcome==="REFUSED_FILESYSTEM","filesystem widening");
 const secret=request();secret.runtimeRequest.secrets=[{name:"TOKEN",brokerRef:"openbao:agent/token",class:"host-only",delivery:"opaque-handle"}];
 ok(compileOpenShellPolicy(secret).outcome==="REFUSED_TASK","missing credential binding");
}
function controls(){
 const wildcard=request();wildcard.networkPolicies=[{id:"wild",name:"wild",endpoints:[{host:"*.example.com",port:443,protocol:"rest",enforcement:"enforce",access:"read-only"}],binaries:["/usr/bin/curl"]}];
 red(()=>validateOpenShellPolicyRequest(wildcard),"wildcard host");
 const hostPath=request();hostPath.filesystem.readWrite=["/Users/owner/project"];
 red(()=>validateOpenShellPolicyRequest(hostPath),"host path");
 const overlap=request();overlap.filesystem.readOnly.push("/sandbox");
 red(()=>validateOpenShellPolicyRequest(overlap),"filesystem overlap");
 const command=request();command.runtimeRequest.workload.input={command:"rm -rf /"};
 red(()=>validateOpenShellPolicyRequest(command),"generic command");
 const secret=request();secret.credentialBindings=[{name:"TOKEN",brokerRef:"file:/tmp/token"}];
 red(()=>validateOpenShellPolicyRequest(secret),"file credential");
 const promoted=request();promoted.upstream.artifactAdmission="PASS";
 red(()=>validateOpenShellPolicyRequest(promoted),"artifact self-promotion");
 const inherited=Object.create(request());inherited.schema=OPENSHELL_POLICY_REQUEST_SCHEMA;
 red(()=>validateOpenShellPolicyRequest(inherited),"inherited request");
 const value=request();ok(openShellStaticDigest(value).length===64&&openShellDynamicDigest(value).length===64,"policy digests");
 const reordered=request();reordered.filesystem.readOnly=[...reordered.filesystem.readOnly].reverse();
 ok(openShellStaticDigest(value)===openShellStaticDigest(reordered),"set order changed static digest");
}
positive();hotReload();refusals();controls();
