import {
  SCRCPY_ACTIONS,
  SCRCPY_KEYS,
  SCRCPY_RECEIPT_SCHEMA,
  type AdbHostSubject,
  type ScrcpyAction,
  type ScrcpyCapability,
  type ScrcpyPolicy,
  type ScrcpyPort,
  type ScrcpyReceipt,
  type ScrcpySessionRequest,
  type ScrcpyState,
  type ScrcpyTargetLease,
  type ScrcpyToolSubject,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
// An ADB serial or AVD name. Deliberately narrow: a serial is never a path, a URL or a
// host:port that could redirect the ADB client somewhere else.
const SERIAL = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;

export function fail(message: string): never {
  throw new Error(`invalid scrcpy contract: ${message}`);
}

// QA-SCRCPY-001.
export function assertAdbHostSubject(host: AdbHostSubject): AdbHostSubject {
  if (!SAFE_VERSION.test(host.platformToolsVersion)) fail("host.platformToolsVersion is invalid");
  if (host.platformToolsVersion.toLowerCase() === "latest") fail("host.platformToolsVersion must be exact, not a moving channel");
  if (!SAFE_VERSION.test(host.adbProtocolVersion)) fail("host.adbProtocolVersion is invalid");
  return host;
}

export function assertToolSubject(tool: ScrcpyToolSubject): ScrcpyToolSubject {
  if (!SAFE_VERSION.test(tool.version)) fail("tool.version is invalid");
  if (tool.version.toLowerCase() === "latest") fail("tool.version must be exact, not a moving channel");
  if (!GIT_OID.test(tool.sourceCommit)) fail("tool.sourceCommit must be a full 40-hex object ID");
  if (tool.license !== "Apache-2.0") fail("tool.license is not the admitted licence");
  for (const [name, value] of [
    ["binarySha256", tool.binarySha256],
    ["serverSha256", tool.serverSha256],
    ["licenseSha256", tool.licenseSha256],
    ["sbomSha256", tool.sbomSha256],
    ["noticesSha256", tool.noticesSha256],
  ] as const) {
    if (!SHA_256.test(value)) fail(`tool.${name} is invalid`);
  }
  // The client and the server pushed to the device are two artifacts. Admitting one digest
  // for both would let a swapped server ride in under a verified client.
  if (tool.binarySha256 === tool.serverSha256) fail("tool.binarySha256 and tool.serverSha256 must be distinct artifacts");
  return tool;
}

// QA-SCRCPY-004.
export function assertAction(action: ScrcpyAction, policy: ScrcpyPolicy): ScrcpyAction {
  if (!(SCRCPY_ACTIONS as readonly string[]).includes(action.kind)) fail(`action.kind ${action.kind} is not admitted`);

  const inScreen = (value: number | null, limit: number, label: string): void => {
    if (value === null) fail(`${action.kind} requires ${label}`);
    if (!Number.isSafeInteger(value) || value < 0 || value >= limit) fail(`${label} ${value} is outside the admitted screen`);
  };

  if (action.kind === "tap" || action.kind === "swipe") {
    inScreen(action.x, policy.maxWidth, "x");
    inScreen(action.y, policy.maxHeight, "y");
  } else if (action.x !== null || action.y !== null) {
    fail(`${action.kind} does not take coordinates`);
  }

  if (action.kind === "swipe") {
    inScreen(action.toX, policy.maxWidth, "toX");
    inScreen(action.toY, policy.maxHeight, "toY");
  } else if (action.toX !== null || action.toY !== null) {
    fail(`${action.kind} does not take a destination`);
  }

  if (action.kind === "type-text") {
    if (action.text === null) fail("type-text requires text");
    if (action.text.length > policy.maxTextLength) fail("text exceeds the admitted length");
    if (/[\u0000-\u001f\u007f]/.test(action.text)) fail("text contains a control character");
  } else if (action.text !== null) {
    fail(`${action.kind} does not take text`);
  }

  if (action.kind === "press-key") {
    if (action.key === null) fail("press-key requires a key");
    if (!(SCRCPY_KEYS as readonly string[]).includes(action.key)) fail(`key ${action.key} is not admitted`);
  } else if (action.key !== null) {
    fail(`${action.kind} does not take a key`);
  }

  return action;
}

// QA-SCRCPY-003. The control this exists for is an anonymous request arriving over a tunnel
// that happens to reach the port. Reaching the port is not authorisation.
export function capabilityRefusal(
  capability: ScrcpyCapability,
  lease: ScrcpyTargetLease,
  required: readonly string[],
  nowEpochMs: number,
): string | null {
  if (capability.leaseId !== lease.leaseId) return "the capability was minted for another lease";
  if (capability.nonce.length < 16) return "the capability nonce is too short to be unguessable";
  if (capability.expiresAtEpochMs <= nowEpochMs) return "the capability has expired";
  if (lease.expiresAtEpochMs <= nowEpochMs) return "the lease has expired";
  for (const scope of required) {
    if (!capability.scopes.includes(scope as ScrcpyCapability["scopes"][number])) return `the capability lacks ${scope}`;
  }
  return null;
}

export interface ScrcpySessionOptions {
  adbHost: AdbHostSubject;
  tool: ScrcpyToolSubject;
  policy: ScrcpyPolicy;
  capability: ScrcpyCapability;
  workerId: string;
  nowEpochMs: number;
  port: ScrcpyPort;
}

export function projectScrcpySession(request: ScrcpySessionRequest, options: ScrcpySessionOptions): ScrcpyReceipt {
  const lifecycle: ScrcpyState[] = ["UNRESOLVED"];
  const settle = (outcome: ScrcpyState, detail: string, extra: Partial<ScrcpyReceipt> = {}): ScrcpyReceipt => ({
    schema: SCRCPY_RECEIPT_SCHEMA,
    serial: request.serial,
    targetClass: request.targetClass,
    toolVersion: options.tool.version,
    lifecycle: [...lifecycle, outcome],
    outcome: outcome as ScrcpyReceipt["outcome"],
    framesDelivered: 0,
    retainedBytes: 0,
    actionsAccepted: 0,
    actionsRejected: 0,
    leaseReleased: false,
    forwardsCleared: false,
    detail,
    ...extra,
  });

  // QA-SCRCPY-006. An absent ADB host is its own outcome and never a pass.
  const adb = options.port.probeAdb();
  if (!adb.present) return settle("ABSENT_ADB", "no ADB host is present");
  if (adb.platformToolsVersion !== options.adbHost.platformToolsVersion) {
    return settle("ABSENT_ADB", "the ADB platform-tools version is not the admitted one");
  }
  if (adb.adbProtocolVersion !== options.adbHost.adbProtocolVersion) {
    return settle("ABSENT_ADB", "the ADB protocol version is not the admitted one");
  }
  lifecycle.push("ADB_HOST_CHECKED");

  // QA-SCRCPY-001. The control is a mutable installer: a binary that is present but is not
  // the artifact that was admitted. Version agreement alone would not catch it.
  const tool = options.port.probeTool();
  if (!tool.installed) return settle("TOOL_REFUSED", "scrcpy is not installed");
  if (tool.version !== options.tool.version) return settle("TOOL_REFUSED", "the installed scrcpy is not the admitted version");
  if (tool.binarySha256 !== options.tool.binarySha256) {
    return settle("TOOL_REFUSED", "the installed scrcpy binary is not the admitted artifact");
  }
  lifecycle.push("TOOL_ADMITTED");

  // QA-SCRCPY-002.
  if (!SERIAL.test(request.serial)) return settle("ABSENT_TARGET", "the request does not name a well-formed serial");
  const lease = options.port.acquire(request.serial, options.workerId);
  if (lease === null) return settle("ABSENT_TARGET", "no Android target was available to lease");
  if (lease.serial !== request.serial) return settle("LEASE_REFUSED", "the lease is for another target");
  if (lease.ownerWorkerId !== options.workerId) return settle("LEASE_REFUSED", "the lease is owned by another worker");
  if (lease.leaseId !== request.leaseId) return settle("LEASE_REFUSED", "the request names a different lease");
  if (lease.targetClass !== request.targetClass) return settle("LEASE_REFUSED", "the lease target class does not match the request");
  lifecycle.push("TARGET_LEASED");

  // QA-SCRCPY-007. Once a lease exists there is no path to a receipt that skips cleanup, and
  // a forward, socket or temp file that outlived the session overrides the outcome.
  const finish = (outcome: ScrcpyState, detail: string, extra: Partial<ScrcpyReceipt> = {}): ScrcpyReceipt => {
    lifecycle.push("STOPPING");
    const released = options.port.release(lease);
    const forwardsCleared = options.port.retainedForwards() === 0 && options.port.retainedSockets() === 0;
    const clean = released && forwardsCleared && options.port.retainedProcesses() === 0 && options.port.retainedTempBytes() === 0;
    if (clean) lifecycle.push("RELEASED");
    return settle(
      clean ? outcome : "FAILED_CLEANUP",
      clean ? detail : "a process, forward, socket, temp file or lease was retained after the session",
      { ...extra, leaseReleased: released, forwardsCleared },
    );
  };

  const refusal = capabilityRefusal(options.capability, lease, request.requestedScopes, options.nowEpochMs);
  if (refusal !== null) return finish("AUTH_REFUSED", refusal);

  lifecycle.push("STARTING");
  if (!options.port.start(lease)) return finish("START_FAILED", "the scrcpy server did not start on the target");
  lifecycle.push("READY");

  let framesDelivered = 0;
  let retainedBytes = 0;
  if (request.requestedScopes.includes("scrcpy.stream")) {
    if (!Number.isSafeInteger(request.streamSeconds) || request.streamSeconds <= 0) {
      return finish("STREAM_FAILED", "the requested stream duration is not a positive whole number of seconds");
    }
    if (request.streamSeconds > options.policy.maxStreamSeconds) {
      return finish("TIMED_OUT", "the requested stream exceeds the admitted duration");
    }
    lifecycle.push("STREAMING");
    const stats = options.port.stream(lease, request.streamSeconds);
    if (stats === null) return finish("STREAM_FAILED", "the frame stream produced nothing");
    if (stats.durationMs > options.policy.maxStreamSeconds * 1000) {
      return finish("TIMED_OUT", "the stream ran past its admitted duration");
    }
    // QA-SCRCPY-005. Every dimension the issue names is bounded, each with its own refusal so
    // a reader can tell which bound a capture broke.
    if (stats.width > options.policy.maxWidth || stats.height > options.policy.maxHeight) {
      return finish("STREAM_FAILED", "the stream exceeded its admitted resolution");
    }
    if (stats.bitrateKbps > options.policy.maxBitrateKbps) {
      return finish("STREAM_FAILED", "the stream exceeded its admitted bitrate");
    }
    if (stats.framesPerSecond > options.policy.maxFramesPerSecond) {
      return finish("STREAM_FAILED", "the stream exceeded its admitted frame rate");
    }
    // Retention is the "prohibited content retention" control: a policy that does not retain
    // must produce nothing on disk, and one that does is still held to a size bound.
    if (!options.policy.retainFrames && stats.retainedBytes > 0) {
      return finish("STREAM_FAILED", "the stream retained frames under a policy that does not admit retention");
    }
    if (stats.retainedBytes > options.policy.maxRetainedBytes) {
      return finish("STREAM_FAILED", "the stream retained more than its admitted bytes");
    }
    framesDelivered = stats.frameCount;
    retainedBytes = stats.retainedBytes;
  }

  let accepted = 0;
  let rejected = 0;
  if (request.actions.length > 0) {
    if (!request.requestedScopes.includes("scrcpy.act")) {
      return finish("AUTH_REFUSED", "input was injected without the act scope");
    }
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
    if (result === null) return finish("ACTION_FAILED", "the input batch produced no result");
    if (result.rejected > 0) {
      return finish("ACTION_FAILED", result.detail, { framesDelivered, retainedBytes, actionsAccepted: result.accepted, actionsRejected: result.rejected });
    }
    accepted = result.accepted;
    rejected = result.rejected;
  }

  return finish("RELEASED", "the projection session completed within its admitted bounds", {
    framesDelivered,
    retainedBytes,
    actionsAccepted: accepted,
    actionsRejected: rejected,
  });
}

// QA-SCRCPY-008. An emulator says nothing about a physical handset -- not about its radio, its
// sensors, its keystore or its vendor build. PASS is absent from the return type for the same
// reason as in the iOS provider: only an admitted live device run could produce one, and the
// deterministic fake below is incapable of witnessing it.
export function physicalDeviceEvidence(receipt: ScrcpyReceipt): "NOT_EXERCISED" | "FAIL" {
  if (receipt.targetClass === "android-emulator") return "NOT_EXERCISED";
  return receipt.outcome === "RELEASED" ? "NOT_EXERCISED" : "FAIL";
}
