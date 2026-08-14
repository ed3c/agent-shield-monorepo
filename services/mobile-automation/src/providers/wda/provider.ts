import {
  WDA_ACTIONS,
  WDA_BUTTONS,
  WDA_RECEIPT_SCHEMA,
  type WdaAction,
  type WdaCapability,
  type WdaHostSubject,
  type WdaPolicy,
  type WdaPort,
  type WdaReceipt,
  type WdaSessionRequest,
  type WdaState,
  type WdaTargetLease,
  type WdaToolchainSubject,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const UDID = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/;

export function fail(message: string): never {
  throw new Error(`invalid wda contract: ${message}`);
}

// QA-WDA-001. The admitted identity is checked for shape here; whether the host *is* this is
// decided against the port's observation in `projectWdaSession`.
export function assertHostSubject(host: WdaHostSubject): WdaHostSubject {
  if (host.platform !== "darwin") fail("host.platform must be darwin");
  if (!SAFE_VERSION.test(host.osVersion)) fail("host.osVersion is invalid");
  if (!SAFE_VERSION.test(host.xcodeVersion)) fail("host.xcodeVersion is invalid");
  if (host.xcodeVersion.toLowerCase() === "latest") fail("host.xcodeVersion must be exact, not a moving channel");
  if (!SAFE_VERSION.test(host.xcodeBuild)) fail("host.xcodeBuild is invalid");
  return host;
}

export function assertToolchainSubject(tool: WdaToolchainSubject): WdaToolchainSubject {
  if (!SAFE_VERSION.test(tool.version)) fail("toolchain.version is invalid");
  if (tool.version.toLowerCase() === "latest") fail("toolchain.version must be exact, not a moving channel");
  if (!GIT_OID.test(tool.sourceCommit)) fail("toolchain.sourceCommit must be a full 40-hex object ID");
  if (tool.license !== "BSD-3-Clause") fail("toolchain.license is not the admitted licence");
  for (const [name, value] of [
    ["artifactSha256", tool.artifactSha256],
    ["licenseSha256", tool.licenseSha256],
    ["sbomSha256", tool.sbomSha256],
    ["noticesSha256", tool.noticesSha256],
  ] as const) {
    if (!SHA_256.test(value)) fail(`toolchain.${name} is invalid`);
  }
  return tool;
}

// QA-WDA-004. Each action is checked against the policy's bounds before any of them is sent.
// The kind itself is closed by the type, so what remains is the numeric and text envelope.
export function assertAction(action: WdaAction, policy: WdaPolicy): WdaAction {
  if (!(WDA_ACTIONS as readonly string[]).includes(action.kind)) fail(`action.kind ${action.kind} is not admitted`);

  const inScreen = (value: number | null, limit: number, label: string): void => {
    if (value === null) fail(`${action.kind} requires ${label}`);
    if (!Number.isSafeInteger(value) || value < 0 || value >= limit) fail(`${label} ${value} is outside the admitted screen`);
  };

  if (action.kind === "tap" || action.kind === "swipe") {
    inScreen(action.x, policy.screenWidth, "x");
    inScreen(action.y, policy.screenHeight, "y");
  } else if (action.x !== null || action.y !== null) {
    fail(`${action.kind} does not take coordinates`);
  }

  if (action.kind === "swipe") {
    inScreen(action.toX, policy.screenWidth, "toX");
    inScreen(action.toY, policy.screenHeight, "toY");
  } else if (action.toX !== null || action.toY !== null) {
    fail(`${action.kind} does not take a destination`);
  }

  if (action.kind === "type-text") {
    if (action.text === null) fail("type-text requires text");
    if (action.text.length > policy.maxTextLength) fail("text exceeds the admitted length");
    // A control character is how a payload smuggles a line break into a field that is meant
    // to hold what a person would type.
    if (/[\u0000-\u001f\u007f]/.test(action.text)) fail("text contains a control character");
  } else if (action.text !== null) {
    fail(`${action.kind} does not take text`);
  }

  if (action.kind === "press-button") {
    if (action.button === null) fail("press-button requires a button");
    if (!(WDA_BUTTONS as readonly string[]).includes(action.button)) fail(`button ${action.button} is not admitted`);
  } else if (action.button !== null) {
    fail(`${action.kind} does not take a button`);
  }

  return action;
}

// QA-WDA-003. A capability authorises one actor, for one lease, for named scopes, until an
// expiry. Every one of those four is load-bearing, so each gets its own refusal.
export function capabilityRefusal(
  capability: WdaCapability,
  lease: WdaTargetLease,
  required: readonly string[],
  nowEpochMs: number,
): string | null {
  if (capability.leaseId !== lease.leaseId) return "the capability was minted for another lease";
  if (capability.nonce.length < 16) return "the capability nonce is too short to be unguessable";
  if (capability.expiresAtEpochMs <= nowEpochMs) return "the capability has expired";
  if (lease.expiresAtEpochMs <= nowEpochMs) return "the lease has expired";
  for (const scope of required) {
    if (!capability.scopes.includes(scope as WdaCapability["scopes"][number])) return `the capability lacks ${scope}`;
  }
  return null;
}

export interface WdaSessionOptions {
  host: WdaHostSubject;
  toolchain: WdaToolchainSubject;
  policy: WdaPolicy;
  capability: WdaCapability;
  workerId: string;
  nowEpochMs: number;
  port: WdaPort;
}

export function projectWdaSession(request: WdaSessionRequest, options: WdaSessionOptions): WdaReceipt {
  const lifecycle: WdaState[] = ["UNRESOLVED"];
  const settle = (outcome: WdaState, detail: string, extra: Partial<WdaReceipt> = {}): WdaReceipt => ({
    schema: WDA_RECEIPT_SCHEMA,
    udid: request.udid,
    targetClass: request.targetClass,
    toolchainVersion: options.toolchain.version,
    lifecycle: [...lifecycle, outcome],
    outcome: outcome as WdaReceipt["outcome"],
    framesDelivered: 0,
    actionsAccepted: 0,
    actionsRejected: 0,
    leaseReleased: false,
    derivedDataCleared: false,
    detail,
    ...extra,
  });

  // QA-WDA-001 and QA-WDA-006. An absent or wrong host is its own outcome. It is never a skip
  // and never a pass -- "no macOS runner" and "the projection worked" must not look alike.
  const hostProbe = options.port.probeHost();
  if (hostProbe.platform !== options.host.platform) {
    return settle("ABSENT_MAC_HOST", `the host is ${hostProbe.platform}, not the admitted darwin`);
  }
  if (hostProbe.osVersion !== options.host.osVersion) {
    return settle("ABSENT_MAC_HOST", "the host macOS version is not the admitted one");
  }
  lifecycle.push("MAC_HOST_CHECKED");

  if (hostProbe.xcodeVersion !== options.host.xcodeVersion || hostProbe.xcodeBuild !== options.host.xcodeBuild) {
    return settle("ABSENT_XCODE", "the Xcode version or build is not the admitted one");
  }
  const toolProbe = options.port.probeToolchain();
  if (!toolProbe.installed || toolProbe.version !== options.toolchain.version) {
    return settle("ABSENT_XCODE", "WebDriverAgent is absent or not the admitted version");
  }
  lifecycle.push("TOOLCHAIN_ADMITTED");

  // QA-WDA-002. The lease must be for the UDID we asked about and owned by this worker.
  if (!UDID.test(request.udid)) return settle("ABSENT_TARGET", "the request does not name a well-formed UDID");
  const lease = options.port.acquire(request.udid, options.workerId);
  if (lease === null) return settle("ABSENT_TARGET", "no iOS target was available to lease");
  if (lease.udid !== request.udid) return settle("AUTH_REFUSED", "the lease is for another target");
  if (lease.ownerWorkerId !== options.workerId) return settle("AUTH_REFUSED", "the lease is owned by another worker");
  if (lease.leaseId !== request.leaseId) return settle("AUTH_REFUSED", "the request names a different lease");
  if (lease.targetClass !== request.targetClass) return settle("AUTH_REFUSED", "the lease target class does not match the request");
  lifecycle.push("TARGET_LEASED");

  // Once a lease exists, every exit runs cleanup. QA-WDA-007 is enforced by there being no
  // path from here to a receipt that skips this function.
  const finish = (outcome: WdaState, detail: string, extra: Partial<WdaReceipt> = {}): WdaReceipt => {
    lifecycle.push("STOPPING");
    const released = options.port.release(lease);
    const derivedDataCleared = options.port.retainedDerivedDataMb() <= options.policy.maxDerivedDataMb;
    const clean = released && options.port.retainedProcesses() === 0 && options.port.retainedPorts() === 0 && derivedDataCleared;
    if (clean) lifecycle.push("RELEASED");
    return settle(
      clean ? outcome : "FAILED_CLEANUP",
      clean ? detail : "a process, port, lease or derived-data directory was retained after the session",
      { ...extra, leaseReleased: released, derivedDataCleared },
    );
  };

  const refusal = capabilityRefusal(options.capability, lease, request.requestedScopes, options.nowEpochMs);
  if (refusal !== null) return finish("AUTH_REFUSED", refusal);

  if (!options.port.signingApproved(lease)) {
    return finish("SIGNING_REFUSED", "the host did not approve signing for this target");
  }

  lifecycle.push("BUILDING");
  if (!options.port.build(lease)) return finish("BUILD_FAILED", "the WebDriverAgent runner did not build");
  lifecycle.push("INSTALLING");
  // An install failure is a build-product failure: the runner never landed on the target.
  if (!options.port.install(lease)) return finish("BUILD_FAILED", "the runner did not install on the target");
  lifecycle.push("STARTING");
  if (!options.port.start(lease)) return finish("START_FAILED", "the runner did not start");
  lifecycle.push("READY");

  let framesDelivered = 0;
  if (request.requestedScopes.includes("wda.stream")) {
    if (!Number.isSafeInteger(request.streamSeconds) || request.streamSeconds <= 0) {
      return finish("STREAM_FAILED", "the requested stream duration is not a positive whole number of seconds");
    }
    if (request.streamSeconds > options.policy.maxStreamSeconds) {
      return finish("TIMED_OUT", "the requested stream exceeds the admitted duration");
    }
    lifecycle.push("STREAMING");
    const stream = options.port.stream(lease, request.streamSeconds);
    if (stream === null) return finish("STREAM_FAILED", "the frame stream produced nothing");
    if (stream.durationMs > options.policy.maxStreamSeconds * 1000) {
      return finish("TIMED_OUT", "the stream ran past its admitted duration");
    }
    if (stream.framesPerSecond > options.policy.maxFramesPerSecond) {
      return finish("STREAM_FAILED", "the stream exceeded its admitted frame rate");
    }
    // QA-WDA-005. Bounds and redaction are checked per frame. A single unredacted secure
    // frame fails the session rather than being dropped quietly from the receipt.
    for (const frame of stream.frames) {
      if (!SHA_256.test(frame.sha256)) return finish("STREAM_FAILED", "a frame is not content-addressed");
      if (!Number.isSafeInteger(frame.bytes) || frame.bytes <= 0 || frame.bytes > options.policy.maxFrameBytes) {
        return finish("STREAM_FAILED", "a frame exceeds its admitted size");
      }
      if (options.policy.requireSecureFieldRedaction && frame.secureFieldsPresent && !frame.redacted) {
        return finish("STREAM_FAILED", "a frame captured a secure field without redaction");
      }
    }
    framesDelivered = stream.frames.length;
  }

  let accepted = 0;
  let rejected = 0;
  if (request.actions.length > 0) {
    if (!request.requestedScopes.includes("wda.act")) {
      return finish("AUTH_REFUSED", "actions were sent without the act scope");
    }
    // QA-WDA-004. Rate is a bound on the batch, not a hope about the caller.
    if (request.actions.length > options.policy.maxActionsPerMinute) {
      return finish("ACTION_FAILED", "the batch exceeds the admitted action rate");
    }
    for (const action of request.actions) {
      try {
        assertAction(action, options.policy);
      } catch (error) {
        return finish("ACTION_FAILED", error instanceof Error ? error.message : String(error));
      }
    }
    lifecycle.push("ACTING");
    const result = options.port.act(lease, request.actions);
    if (result === null) return finish("ACTION_FAILED", "the action batch produced no result");
    if (result.rejected > 0) {
      return finish("ACTION_FAILED", result.detail, { framesDelivered, actionsAccepted: result.accepted, actionsRejected: result.rejected });
    }
    accepted = result.accepted;
    rejected = result.rejected;
  }

  return finish("RELEASED", "the projection session completed within its admitted bounds", {
    framesDelivered,
    actionsAccepted: accepted,
    actionsRejected: rejected,
  });
}

// QA-WDA-008. What a receipt is allowed to stand for about *physical-device* behaviour --
// Secure Enclave, real sensors, real signing. A simulator session is genuine evidence about
// the projection and none at all about hardware, so it can never be more than NOT_EXERCISED.
//
// PASS is deliberately absent from the return type. A device session that failed is real
// negative evidence and reports FAIL, but no arrangement of a receipt yields a positive
// hardware claim here: the only thing that could is an admitted live device run, which this
// repository has never performed. Widening this to include PASS would let the deterministic
// fake below mint exactly the hardware claim it is incapable of witnessing.
export function physicalDeviceEvidence(receipt: WdaReceipt): "NOT_EXERCISED" | "FAIL" {
  if (receipt.targetClass === "ios-simulator") return "NOT_EXERCISED";
  return receipt.outcome === "RELEASED" ? "NOT_EXERCISED" : "FAIL";
}
