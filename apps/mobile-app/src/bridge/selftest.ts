import { readFileSync } from "node:fs";
import {
  FakeAppPort,
  InAppBridge,
  SHIPPED_RUNTIME_FILES,
  bridgeProviderState,
  compileRegistry,
  routeFor,
  storeComplianceEvidence,
  type BridgeCapability,
  type BridgeConfig,
  type BridgeRegistry,
  type BridgeRequest,
} from "./index.ts";
import type { ProductActionDefinition } from "../../../../packages/contracts/src/product/index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`UX-BRIDGE ${message}`);
}

function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.startsWith("invalid bridge contract: "), `${message} threw "${text}" rather than a bridge contract error`);
}

const NOW = 1_700_000_000_000;

function action(overrides: Partial<ProductActionDefinition> = {}): ProductActionDefinition {
  return {
    id: "approve-run",
    version: "1.0.0",
    surface: "mobile",
    target: { targetId: "dashboard.approve-run", role: "button", label: "Approve run" },
    allowedArgumentKeys: ["run-id"],
    requiredScopes: ["product.write"],
    riskClass: "write",
    humanAdmitRequired: false,
    ...overrides,
  };
}

const DEFINITIONS: ProductActionDefinition[] = [
  action(),
  action({ id: "view-run", allowedArgumentKeys: ["run-id"], requiredScopes: ["product.read"], riskClass: "read" }),
  action({ id: "settle-run", riskClass: "privileged", requiredScopes: ["product.write"] }),
  action({ id: "release-funds", humanAdmitRequired: true, requiredScopes: ["product.write"] }),
];

function registry(): BridgeRegistry {
  return compileRegistry(DEFINITIONS);
}

function config(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    enabled: true,
    binding: { kind: "loopback", port: 8791 },
    maxRequestsPerMinute: 10,
    maxArgumentBytes: 1_024,
    maxLogEntries: 4,
    ...overrides,
  };
}

function capability(overrides: Partial<BridgeCapability> = {}): BridgeCapability {
  return {
    actorKind: "human",
    actorId: "operator-1",
    sessionId: "session-1",
    scopes: ["product.read", "product.write"],
    expiresAtEpochMs: NOW + 600_000,
    ...overrides,
  };
}

let nonceCounter = 0;
function request(overrides: Partial<BridgeRequest> = {}): BridgeRequest {
  nonceCounter += 1;
  return {
    actionId: "approve-run",
    arguments: { "run-id": "run-42" },
    nonce: `nonce-${String(nonceCounter).padStart(18, "0")}`,
    requestDigest: "a".repeat(64),
    issuedAtEpochMs: NOW,
    ...overrides,
  };
}

function started(overrides: Partial<BridgeConfig> = {}, port = new FakeAppPort()) {
  const bridge = new InAppBridge(config(overrides), registry(), port);
  bridge.start();
  return { bridge, port };
}

// UX-BRIDGE-001 bind scope
function bindScope(): void {
  // Default disabled: a bridge whose config does not enable it never reaches READY.
  const off = new InAppBridge(config({ enabled: false }), registry(), new FakeAppPort());
  ok(off.start() === "DISABLED", `a disabled bridge started into ${off.start()}`);
  ok(off.handle(request(), capability(), NOW).outcome === "NOT_IMPLEMENTED", "a disabled bridge served a request");

  const { bridge } = started();
  ok(bridge.state === "READY", `an enabled bridge started into ${bridge.state}`);

  // The binding union has no host, address or interface field, so `0.0.0.0` cannot be named.
  const loopback = config().binding;
  ok(loopback.kind === "loopback", "the fixture binding changed kind");
  ok(Object.keys(loopback).sort().join(",") === "kind,port", `the binding grew a field: ${Object.keys(loopback).join(",")}`);
  const brokered = config({ binding: { kind: "brokered", brokerRef: "broker-1" } }).binding;
  ok(Object.keys(brokered).sort().join(",") === "brokerRef,kind", "the brokered binding grew a field");

  red(() => new InAppBridge(config({ binding: { kind: "loopback", port: 80 } }), registry(), new FakeAppPort()), "a privileged port");
  red(() => new InAppBridge(config({ binding: { kind: "loopback", port: 70_000 } }), registry(), new FakeAppPort()), "an out-of-range port");
  red(() => new InAppBridge(config({ binding: { kind: "brokered", brokerRef: "../elsewhere" } }), registry(), new FakeAppPort()), "a broker ref that is a path");
  red(() => new InAppBridge(config({ maxRequestsPerMinute: 0 }), registry(), new FakeAppPort()), "a zero rate limit");
  red(() => new InAppBridge(config({ maxArgumentBytes: 0 }), registry(), new FakeAppPort()), "a zero argument bound");
  red(() => new InAppBridge(config({ maxLogEntries: 0 }), registry(), new FakeAppPort()), "a zero log bound");
}

// UX-BRIDGE-002 closed registry
function closedRegistry(): void {
  const { bridge, port } = started();
  ok(bridge.handle(request(), capability(), NOW).outcome === "RESPONDING", "the happy path was refused");
  ok(port.dispatched.length === 1, "the action never reached the app port");

  // The control: a raw method, module, URL, script or command. None of them is an action id in
  // the compiled registry, and there is no other field they could arrive in.
  for (const actionId of ["eval", "require", "https://example.test/payload", "rm -rf /", "../../etc/passwd", "Function"]) {
    const response = bridge.handle(request({ actionId }), capability(), NOW);
    ok(response.outcome === "UNKNOWN_ACTION", `${actionId} reported ${response.outcome}`);
  }

  // The request type has no field a raw method or URL could occupy in the first place.
  const fields = Object.keys(request()).sort().join(",");
  ok(fields === "actionId,arguments,issuedAtEpochMs,nonce,requestDigest", `the request grew a field: ${fields}`);

  // An admitted key carrying an inadmissible amount of data. The key closure above would wave
  // this through, because the key itself is fine -- the size is a separate rule.
  const oversized = bridge.handle(request({ arguments: { "run-id": "x".repeat(2_000) } }), capability(), NOW);
  ok(oversized.outcome === "INVALID_ARGUMENTS", `oversized arguments reported ${oversized.outcome}`);
  ok(oversized.detail.includes("admitted size"), `the size rule did not catch it: ${oversized.detail}`);

  red(() => compileRegistry([action(), action()]), "an action registered twice");
  red(() => compileRegistry([action({ id: "Approve Run" })]), "a non-portable action id");
  red(() => compileRegistry([action({ allowedArgumentKeys: ["run id"] })]), "a non-portable argument key");
}

// UX-BRIDGE-003 auth and replay
function authAndReplay(): void {
  const { bridge } = started();

  for (const [label, patch, expected] of [
    ["an expired capability", { expiresAtEpochMs: NOW - 1 }, "AUTH_REFUSED"],
    ["a malformed session", { sessionId: "" }, "AUTH_REFUSED"],
    ["a malformed actor", { actorId: "" }, "AUTH_REFUSED"],
  ] as const) {
    ok(bridge.handle(request(), capability(patch), NOW).outcome === expected, `${label} was accepted`);
  }

  ok(bridge.handle(request({ nonce: "short" }), capability(), NOW).outcome === "AUTH_REFUSED", "a guessable nonce was accepted");
  ok(bridge.handle(request({ requestDigest: "nope" }), capability(), NOW).outcome === "AUTH_REFUSED", "an unbound request digest was accepted");

  // The control: a replay. The same nonce twice in one session is refused the second time.
  const replayed = request();
  ok(bridge.handle(replayed, capability(), NOW).outcome === "RESPONDING", "the first use of a nonce was refused");
  const second = bridge.handle(replayed, capability(), NOW);
  ok(second.outcome === "REPLAY_REFUSED", `a replayed nonce reported ${second.outcome}`);

  // A foreign session cannot spend another session's nonce either -- but nor is it blocked by
  // one: sessions are separate, so the refusal above is replay and not collision.
  ok(bridge.handle(replayed, capability({ sessionId: "session-2" }), NOW).outcome === "RESPONDING", "sessions share a nonce space");

  // A refused request must not burn the nonce an honest caller still needs.
  const refusedFirst = request({ actionId: "settle-run" });
  ok(bridge.handle(refusedFirst, capability(), NOW).outcome === "RISK_REFUSED", "the risk fixture stopped being refused");
  ok(
    bridge.handle({ ...refusedFirst, actionId: "approve-run" }, capability(), NOW).outcome === "RESPONDING",
    "a refused request burned its nonce",
  );

  // Rate limiting is counted before dispatch.
  const { bridge: limited } = started({ maxRequestsPerMinute: 2 });
  ok(limited.handle(request(), capability(), NOW).outcome === "RESPONDING", "the first request was limited");
  ok(limited.handle(request(), capability(), NOW).outcome === "RESPONDING", "the second request was limited");
  ok(limited.handle(request(), capability(), NOW).outcome === "RATE_LIMITED", "the third request was not limited");
  // The window rolls: a minute later the budget is back.
  ok(limited.handle(request(), capability(), NOW + 60_000).outcome === "RESPONDING", "the rate window never rolls");
}

// UX-BRIDGE-004 risk boundary
function riskBoundary(): void {
  const { bridge, port } = started();

  // A privileged action routes to hardware; a human-admit action routes to a human. Neither is
  // something the bridge can grant, and both are distinct from a plain denial.
  const privileged = bridge.handle(request({ actionId: "settle-run" }), capability(), NOW);
  ok(privileged.outcome === "RISK_REFUSED", `a privileged action reported ${privileged.outcome}`);
  ok(privileged.routedTo === "WAITING_FOR_HARDWARE", `a privileged action routed to ${privileged.routedTo}`);

  const humanAdmit = bridge.handle(request({ actionId: "release-funds" }), capability(), NOW);
  ok(humanAdmit.outcome === "RISK_REFUSED", `a human-admit action reported ${humanAdmit.outcome}`);
  ok(humanAdmit.routedTo === "WAITING_FOR_HUMAN", `a human-admit action routed to ${humanAdmit.routedTo}`);

  // A missing scope is a denial, not a routing.
  const denied = bridge.handle(request(), capability({ scopes: ["product.read"] }), NOW);
  ok(denied.outcome === "AUTH_REFUSED", `a missing scope reported ${denied.outcome}`);
  ok(denied.routedTo === "DENIED", `a missing scope routed to ${denied.routedTo}`);

  // The control: none of these reached the app.
  ok(port.dispatched.length === 0, "a gated action reached the app port");

  // The routing decision is read off the definition. There is no caller-supplied field that
  // changes it, so "self-admit" has nothing to operate on.
  ok(routeFor(action({ humanAdmitRequired: true }), capability()) === "WAITING_FOR_HUMAN", "a human-admit action stopped routing");
  ok(routeFor(action({ riskClass: "privileged" }), capability()) === "WAITING_FOR_HARDWARE", "a privileged action stopped routing");
  ok(routeFor(action(), capability()) === null, "an ordinary action was routed away");
  ok(routeFor(action(), capability({ scopes: [] })) === "DENIED", "a scopeless capability was admitted");

  // A successful response never carries a routing, so the two answers cannot be confused.
  ok(bridge.handle(request(), capability(), NOW).routedTo === null, "a success carried a routing");
}

// UX-BRIDGE-005 privacy
function privacy(): void {
  const { bridge } = started();
  bridge.handle(request({ arguments: { "run-id": "SECRET-RUN-VALUE" } }), capability(), NOW);

  const serialized = JSON.stringify(bridge.log);
  ok(!serialized.includes("SECRET-RUN-VALUE"), "the log persisted an argument value");
  ok(!serialized.includes("nonce-"), "the log persisted a nonce");
  ok(!serialized.includes("a".repeat(64)), "the log persisted a request digest");

  const entry = bridge.log[0];
  ok(entry !== undefined, "nothing was logged at all");
  ok(Object.keys(entry).sort().join(",") === "actionId,actorId,atEpochMs,outcome", `a log entry grew a field: ${Object.keys(entry).join(",")}`);

  // The log is bounded: the oldest entries fall off rather than the process growing a
  // transcript of everything an operator ever did.
  const { bridge: chatty } = started({ maxLogEntries: 4 });
  for (let index = 0; index < 12; index += 1) chatty.handle(request(), capability(), NOW);
  ok(chatty.log.length === 4, `the log grew to ${chatty.log.length}, past its bound of 4`);

  // A caller cannot empty the log by mutating what it was handed.
  const copy = chatty.log as unknown as unknown[];
  copy.length = 0;
  ok(chatty.log.length === 4, "the log was emptied by a caller");

  // A refusal is logged too: a bridge that only records successes hides exactly the traffic
  // worth reviewing.
  const { bridge: refusing } = started();
  refusing.handle(request({ actionId: "release-funds" }), capability(), NOW);
  ok(refusing.log[0]?.outcome === "RISK_REFUSED", "a refusal was not logged");
}

// UX-BRIDGE-006 lifecycle
function lifecycle(): void {
  const { bridge, port } = started();
  ok(bridge.state === "READY", "the bridge did not reach READY");

  // Backgrounding drops the session; resuming re-authenticates rather than inheriting it.
  ok(bridge.on("background") === "AUTHENTICATING", "backgrounding left the bridge ready");
  ok(bridge.handle(request(), capability(), NOW).outcome === "NOT_IMPLEMENTED", "a backgrounded bridge served a request");
  ok(bridge.on("foreground") === "READY", "foregrounding did not restore the bridge");
  ok(bridge.handle(request(), capability(), NOW).outcome === "RESPONDING", "a resumed bridge refused a request");

  // A nonce spent before backgrounding is not remembered, because the session is not the same
  // session -- so an honest caller is not locked out by its own history.
  const reused = request();
  ok(bridge.handle(reused, capability(), NOW).outcome === "RESPONDING", "the first use was refused");
  bridge.on("background");
  bridge.on("foreground");
  ok(bridge.handle(reused, capability(), NOW).outcome === "RESPONDING", "a new session inherited the old nonce set");

  ok(bridge.on("disconnect") === "AUTHENTICATING", "disconnecting left the bridge ready");

  // Shutdown drains and then checks. The control: a retained listener or session.
  bridge.on("foreground");
  ok(bridge.shutdown() === "DISABLED", "a clean shutdown did not disable the bridge");

  const { bridge: leaky, port: leakyPort } = started();
  leakyPort.listeners = 1;
  ok(leaky.shutdown() === "FAILED_SHUTDOWN", "a retained listener reported a clean shutdown");

  const { bridge: busy, port: busyPort } = started();
  busyPort.sessions = 1;
  ok(busy.shutdown() === "FAILED_SHUTDOWN", "a retained session reported a clean shutdown");

  void port;
}

// UX-BRIDGE-007 mobile runtime
function mobileRuntime(): void {
  // Hermes and JSC have no `node:` modules, no `Bun` and no `process`. An import that assumes
  // otherwise fails on device rather than in CI, so the shipped files are read and scanned.
  // This is a real scan of real bytes, not a declaration that they are clean.
  const forbidden = ["node:", "bun:", "Bun.", "process.", "require(", "__dirname", "globalThis.process"];
  let scanned = 0;
  for (const name of SHIPPED_RUNTIME_FILES) {
    const source = readFileSync(new URL(name, import.meta.url).pathname, "utf8");
    scanned += 1;
    for (const token of forbidden) {
      ok(!source.includes(token), `the shipped runtime file ${name} names the host primitive ${token}`);
    }
  }
  ok(scanned === SHIPPED_RUNTIME_FILES.length, `scanned ${scanned} files, expected ${SHIPPED_RUNTIME_FILES.length}`);
  ok(scanned >= 3, "the shipped runtime list shrank below the files that actually ship");

  // This selftest is not shipped runtime, which is why it may read files at all. If it ever
  // appears in the list, the scan above would fail on its own `node:fs` import -- so the list
  // excluding it is load-bearing rather than an oversight.
  ok(!(SHIPPED_RUNTIME_FILES as readonly string[]).includes("selftest.ts"), "the selftest was declared as shipped runtime");
  ok(!(SHIPPED_RUNTIME_FILES as readonly string[]).includes("fake-app-port.ts"), "the deterministic fake was declared as shipped runtime");
}

// UX-BRIDGE-008 store claim
function storeClaim(): void {
  ok(storeComplianceEvidence() === "NOT_EXERCISED", "a store compliance claim was produced");
  ok(bridgeProviderState.storeCompliance === "NOT_IMPLEMENTED", "store compliance was claimed");
  ok(bridgeProviderState.iosCanary === "NOT_EXERCISED", "an iOS canary was claimed");
  ok(bridgeProviderState.androidCanary === "NOT_EXERCISED", "an Android canary was claimed");
  // The iOS and Android canaries are separate fields, so one platform's result cannot stand in
  // for the other's.
  ok("iosCanary" in bridgeProviderState && "androidCanary" in bridgeProviderState, "the canaries were merged into one field");
}

function stateSeparation(): void {
  const cases = [
    { label: "disabled", run: () => new InAppBridge(config({ enabled: false }), registry(), new FakeAppPort()).handle(request(), capability(), NOW).outcome, expected: "NOT_IMPLEMENTED" },
    { label: "expired capability", run: () => started().bridge.handle(request(), capability({ expiresAtEpochMs: NOW - 1 }), NOW).outcome, expected: "AUTH_REFUSED" },
    { label: "unknown action", run: () => started().bridge.handle(request({ actionId: "ghost" }), capability(), NOW).outcome, expected: "UNKNOWN_ACTION" },
    { label: "bad argument", run: () => started().bridge.handle(request({ arguments: { other: "x" } }), capability(), NOW).outcome, expected: "INVALID_ARGUMENTS" },
    { label: "risk", run: () => started().bridge.handle(request({ actionId: "settle-run" }), capability(), NOW).outcome, expected: "RISK_REFUSED" },
    {
      label: "replay",
      run: () => {
        const { bridge } = started();
        const once = request();
        bridge.handle(once, capability(), NOW);
        return bridge.handle(once, capability(), NOW).outcome;
      },
      expected: "REPLAY_REFUSED",
    },
    {
      label: "rate limited",
      run: () => {
        const { bridge } = started({ maxRequestsPerMinute: 1 });
        bridge.handle(request(), capability(), NOW);
        return bridge.handle(request(), capability(), NOW).outcome;
      },
      expected: "RATE_LIMITED",
    },
    {
      label: "transport failure",
      run: () => {
        const port = new FakeAppPort();
        port.responds = false;
        return started({}, port).bridge.handle(request(), capability(), NOW).outcome;
      },
      expected: "TRANSPORT_FAILED",
    },
    {
      label: "action failure",
      run: () => {
        const port = new FakeAppPort();
        port.succeeds = false;
        return started({}, port).bridge.handle(request(), capability(), NOW).outcome;
      },
      expected: "ACTION_FAILED",
    },
  ] as const;

  for (const item of cases) {
    const outcome = item.run();
    // Pinning each fixture to its own outcome settles "never a silent success" at the same
    // time: none of these nine values is RESPONDING, and the compiler knows it afterwards.
    ok(outcome === item.expected, `${item.label} reported ${outcome}, expected ${item.expected}`);
  }
  ok(new Set(cases.map((item) => item.expected)).size === 9, "the fixtures stopped covering nine distinct outcomes");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const bridgeNeverPasses: NeverPass<typeof bridgeProviderState> = true;
void bridgeNeverPasses;

bindScope();
closedRegistry();
authAndReplay();
riskBoundary();
privacy();
lifecycle();
mobileRuntime();
storeClaim();
stateSeparation();

console.log("SELFTEST GREEN: UX-BRIDGE bind scope, closed registry, auth/replay, risk boundary, privacy, lifecycle, mobile runtime, store claim");
