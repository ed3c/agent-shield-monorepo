import { TMUX_SESSION_RECEIPT_SCHEMA, type TmuxSessionReceipt } from "./types.ts";
import { createTmuxSession } from "./adapter.ts";
import { FakeTmuxDriver, fakeTmuxFrame, fakeTmuxUpstream } from "./fake-driver.ts";
import { assertTmuxNativePlanClosed, buildTmuxNativePlan, tmuxSessionRequestDigest } from "./plan.ts";
import { assertTmuxSessionTransition } from "./state-machine.ts";
import { validateTmuxSessionRequest } from "./validation.ts";

const A="a".repeat(64),B="b".repeat(64),C="c".repeat(64),D="d".repeat(64);
function ok(value:unknown,message:string):asserts value{if(!value)throw new Error(`RT-TMUX ${message}`)}
function red(action:()=>unknown,message:string){let failed=false;try{action()}catch{failed=true}ok(failed,`${message} stayed green`)}
async function redAsync(action:()=>Promise<unknown>,message:string){let failed=false;try{await action()}catch{failed=true}ok(failed,`${message} stayed green`)}
function runtime(requestId="runtime-tmux"){return{
 schema:"agent-shield/runtime-request/v1",requestId,providerId:"local-disposable-worktree",scope:"local",
 requiredCapabilities:["artifact-return","isolated-worktree"],source:{kind:"git",repository:"https://github.com/ed3c/agent-shield-monorepo",commit:"1".repeat(40),tree:"2".repeat(40)},
 workload:{id:"agent.task",version:"1.0.0",input:{taskRef:"task-envelope"}},environment:{allowedVariables:[]},network:{mode:"deny-all",allowlist:[]},secrets:[],
 limits:{timeoutMs:1000,cancellationGraceMs:100,maxInputBytes:1024,maxOutputBytes:4096,maxArtifactBytes:4096,maxTouchedPaths:8},
 mutation:{writableRoots:["workspace/output"],readOnlyRoots:["workspace/input"]},artifacts:[{kind:"log",required:true,maxBytes:1024,mediaTypes:["text/plain"]}],
 cleanup:{processCleanup:"required",workspaceCleanup:"delete",sessionCleanup:"required",maxDurationMs:1000},exclusions:["live-provider","production"]};}
function request(id="tmux-task",workspaceDigest=A):any{return{
 schema:"agent-shield/tmux-session-request/v1",requestId:id,namespace:"agent-task",runtimeRequest:runtime(`runtime-${id}`),
 workspace:{id:`workspace-${id}`,sha256:workspaceDigest},taskProfile:{id:"agent-runner",sha256:B},taskEnvelope:{id:`task-${id}`,sha256:C},
 authorization:{capabilityRef:`capability:tmux/${id}`,audience:"tmux-control",expiresAtEpochMs:10000,actions:["attach","capture","detach","stop"]},
 stream:{maxFrameBytes:1024,maxTotalBytes:4096,maxFrames:16,maxIdleMs:1000,maxTaskMs:5000},cleanup:{sessionRetention:"terminate",maxDurationMs:1000},
 policyEnvelope:{schema:"agent-shield/openshell-policy-envelope/v1",sha256:D},upstream:{...fakeTmuxUpstream},exclusions:["remote-public-port","generic-shell","retained-session"]};}
async function ready(driver:FakeTmuxDriver,value:any,now=100){const result=await createTmuxSession(driver,value,now);ok(result.kind==="ready","session was not ready");return result.controller}
function sessionReceipt(value:TmuxSessionReceipt|unknown):TmuxSessionReceipt{ok((value as any)?.schema===TMUX_SESSION_RECEIPT_SCHEMA,"session receipt missing");return value as TmuxSessionReceipt}

async function persistence(){
 const driver=new FakeTmuxDriver(),value=request(),controller=await ready(driver,value);
 const identity=controller.identity;driver.append(identity.sessionName,"first\n",120);
 const refused=await controller.attach("capability:wrong",130);ok(refused.outcome==="AUTH_REFUSED"&&driver.attachCalls===0,"unauthorized attach reached driver");
 const attached=await controller.attach(value.authorization.capabilityRef,140);ok(attached.outcome==="ATTACHED"&&driver.isAttached(identity.sessionName),"attach");
 const first=await controller.capture(value.authorization.capabilityRef,150);ok(first.capture.frameCount===1&&first.capture.firstSequence===1&&!first.terminal,"first capture");
 const detached=await controller.detach(value.authorization.capabilityRef,160);ok(detached.outcome==="DETACHED"&&driver.isRunning(identity.sessionName),"detach killed task");
 driver.append(identity.sessionName,"second\n",170);
 const reattached=await controller.attach(value.authorization.capabilityRef,180);ok(reattached.outcome==="ATTACHED"&&controller.identity.sessionName===identity.sessionName,"reconnect identity");
 const second=await controller.capture(value.authorization.capabilityRef,190);ok(second.capture.firstSequence===2&&second.capture.lastSequence===2,"sequence continuation");
 driver.complete(identity.sessionName,0,200);
 const final=await controller.capture(value.authorization.capabilityRef,210);ok(final.terminal?.outcome==="TERMINATED"&&final.terminal.cleanup.state==="PASS","normal terminal");
 ok(final.terminal.attachCount===2&&final.terminal.detachCount===1&&final.terminal.authRefusalCount===1,"control counters");
}
async function isolation(){
 const driver=new FakeTmuxDriver(),one=await ready(driver,request("one",A)),two=await ready(driver,request("two",B));
 ok(one.identity.sessionName!==two.identity.sessionName&&one.identity.socketName!==two.identity.socketName,"session namespace collision");
 ok(one.identity.process.groupId!==two.identity.process.groupId&&driver.sessionCount()===2,"process identity collision");
}
async function bounds(){
 const value=request("limit");value.stream.maxFrameBytes=4;value.stream.maxTotalBytes=8;
 const driver=new FakeTmuxDriver(),controller=await ready(driver,value,0);driver.append(controller.identity.sessionName,"12345",10);
 const result=await controller.capture(value.authorization.capabilityRef,20);
 ok(result.capture.truncated&&result.terminal?.outcome==="STREAM_LIMIT"&&result.terminal.streamTruncated,"oversized frame hidden");
 const digestValue=request("digest");const digestDriver=new FakeTmuxDriver(),digestController=await ready(digestDriver,digestValue,0);
 const invalid={...fakeTmuxFrame("hello",1),sha256:"0".repeat(64)};digestDriver.appendFrame(digestController.identity.sessionName,invalid,5);
 ok((await digestController.capture(digestValue.authorization.capabilityRef,10)).terminal?.outcome==="STREAM_LIMIT","frame digest mismatch passed");
}
async function timeAndProcess(){
 const timed=request("timed");timed.stream.maxIdleMs=100;timed.stream.maxTaskMs=200;
 const td=new FakeTmuxDriver(),tc=await ready(td,timed,0);const timeout=await tc.poll(200);ok(timeout?.outcome==="TIMED_OUT"&&timeout.cleanup.state==="PASS","task timeout");
 const idle=request("idle");idle.stream.maxIdleMs=100;idle.stream.maxTaskMs=1000;
 const id=new FakeTmuxDriver(),ic=await ready(id,idle,0);ok((await ic.poll(100))?.outcome==="TIMED_OUT","idle timeout");
 const failed=request("failed");const fd=new FakeTmuxDriver(),fc=await ready(fd,failed,0);fd.complete(fc.identity.sessionName,7,10);
 ok((await fc.poll(20))?.outcome==="PROCESS_FAILED","process failure collapsed");
}
async function cleanup(){
 const value=request("cleanup"),driver=new FakeTmuxDriver(),controller=await ready(driver,value,0);driver.setCleanupFailure(controller.identity.sessionName);
 const result=sessionReceipt(await controller.stop(value.authorization.capabilityRef,10));
 ok(result.outcome==="FAILED_CLEANUP"&&result.cleanup.residue.includes("orphan-descendant"),"cleanup residue hidden");
 const staleValue=request("stale"),staleDriver=new FakeTmuxDriver(),stale=await ready(staleDriver,staleValue,0);staleDriver.rotateProcessIdentity(stale.identity.sessionName);
 const staleResult=sessionReceipt(await stale.stop(staleValue.authorization.capabilityRef,10));
 ok(staleResult.outcome==="FAILED_TERMINATE"&&staleDriver.isRunning(stale.identity.sessionName),"stale process identity was signalled");
}
async function failures(){
 const absentDriver=new FakeTmuxDriver();absentDriver.hostAvailable=false;const absent=await createTmuxSession(absentDriver,request("absent"),0);
 ok(absent.kind==="terminal"&&absent.receipt.outcome==="ABSENT_TMUX"&&absent.receipt.externalTmuxState==="NOT_EXERCISED","absent tmux");
 const createDriver=new FakeTmuxDriver();createDriver.createFailure=true;const failed=await createTmuxSession(createDriver,request("create-fail"),0);
 ok(failed.kind==="terminal"&&failed.receipt.outcome==="FAILED_CREATE","create failure");
 const expired=request("expired");expired.authorization.expiresAtEpochMs=5;const ed=new FakeTmuxDriver(),ec=await ready(ed,expired,0);
 ok((await ec.attach(expired.authorization.capabilityRef,5)).outcome==="AUTH_REFUSED","expired capability");
}
function controls(){
 const value=request();const plan=buildTmuxNativePlan(value);assertTmuxNativePlanClosed(plan);
 ok(plan.createArgv.includes("/app/bin/agent-shield-task-runner")&&!plan.createArgv.includes("bash"),"generic shell plan");
 const reordered=request();reordered.authorization.actions=[...reordered.authorization.actions].reverse();
 ok(tmuxSessionRequestDigest(value)===tmuxSessionRequestDigest(reordered),"set order changed request digest");
 const command=request();command.runtimeRequest.workload.input={command:"arbitrary"};red(()=>validateTmuxSessionRequest(command),"generic command");
 const file=request();file.authorization.capabilityRef="file:/tmp/control";red(()=>validateTmuxSessionRequest(file),"file capability");
 const promoted=request();promoted.upstream.artifactAdmission="PASS";red(()=>validateTmuxSessionRequest(promoted),"artifact self-promotion");
 const retained=request();retained.cleanup.sessionRetention="preserve";red(()=>validateTmuxSessionRequest(retained),"session retention widening");
 const host=request();(host.workspace as any).path="/"+"Users"+"owner";red(()=>validateTmuxSessionRequest(host),"host path");
 const inherited=Object.create(request());inherited.schema="agent-shield/tmux-session-request/v1";red(()=>validateTmuxSessionRequest(inherited),"inherited request");
 red(()=>assertTmuxSessionTransition("UNRESOLVED","ATTACHED"),"transition skip");
}
await persistence();await isolation();await bounds();await timeAndProcess();await cleanup();await failures();controls();
