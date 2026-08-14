import { WORKFLOW_RECEIPT_SCHEMA, type ActivityPort, type WorkflowEvent, type WorkflowReceipt, type WorkflowSdkSubject } from "./types.ts";
import { decide, fail, project } from "./workflow.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

// SEC-WF-008.
export function assertSdkSubject(sdk: WorkflowSdkSubject): WorkflowSdkSubject {
  if (!SAFE_ID.test(sdk.id)) fail("sdk.id is invalid");
  if (!SAFE_VERSION.test(sdk.version)) fail("sdk.version is invalid");
  if (!GIT_OID.test(sdk.sourceCommit)) fail("sdk.sourceCommit must be a full 40-hex object ID");
  if (sdk.license !== "MIT") fail("sdk.license is not the admitted licence");
  for (const [name, digest] of [["artifactSha256", sdk.artifactSha256], ["licenseSha256", sdk.licenseSha256], ["sbomSha256", sdk.sbomSha256]] as const) {
    if (!SHA_256.test(digest)) fail(`sdk.${name} is invalid`);
  }
  if (!SAFE_ID.test(sdk.namespace)) fail("sdk.namespace is invalid");
  return sdk;
}

export interface DriveOptions {
  maxSteps?: number;
}

export interface DriveResult {
  history: WorkflowEvent[];
  receipt: WorkflowReceipt;
  dispatched: string[];
}

// The runtime turns commands into activity calls and appends the results to the history. It
// holds no decision logic of its own: everything it does is a consequence of `decide`, which
// is why a restart can resume from the history alone.
export class DurableWorkflowRuntime {
  readonly #sdk: WorkflowSdkSubject;
  readonly #port: ActivityPort;

  constructor(sdk: WorkflowSdkSubject, port: ActivityPort) {
    this.#sdk = assertSdkSubject(sdk);
    this.#port = port;
  }

  get sdkSubject(): WorkflowSdkSubject {
    return { ...this.#sdk };
  }

  drive(history: readonly WorkflowEvent[], options: DriveOptions = {}): DriveResult {
    const maxSteps = options.maxSteps ?? 32;
    const working: WorkflowEvent[] = [...history];
    const dispatched: string[] = [];
    const spent = new Set<string>();

    for (let step = 0; step < maxSteps; step += 1) {
      const command = decide(working);
      if (command.kind === "settle") {
        return { history: working, receipt: this.#receipt(working, command.state, command.detail), dispatched };
      }
      if (command.kind === "wait") {
        // SEC-WF-003. A wait is a stable point: the runtime stops here and the history is
        // enough to resume from. It never becomes a success by being waited on.
        return { history: working, receipt: this.#receipt(working, command.state, "waiting"), dispatched };
      }

      // SEC-WF-002. The idempotency key is derived from the workflow and the activity, so a
      // repeated dispatch of the same activity is refused by the runtime rather than relying
      // on the provider to deduplicate.
      if (spent.has(command.idempotencyKey)) {
        return { history: working, receipt: this.#receipt(working, "FAILED", "a duplicate activity dispatch was attempted"), dispatched };
      }
      spent.add(command.idempotencyKey);
      dispatched.push(command.idempotencyKey);

      const at = working[working.length - 1].atEpochMs + 1;
      const result = this.#port.run(command.activity, command.idempotencyKey);
      if (!result.ok) {
        working.push({ kind: "activity-failed", atEpochMs: at, activity: command.activity, sequence: command.sequence, detail: result.detail });
        continue;
      }
      working.push({
        kind: "activity-completed",
        atEpochMs: at,
        activity: command.activity,
        sequence: command.sequence,
        ...(result.tier === undefined ? {} : { tier: result.tier }),
        ...(result.epochs === undefined ? {} : { epochs: result.epochs }),
      });
    }

    return { history: working, receipt: this.#receipt(working, "FAILED", "the workflow did not settle within its step budget"), dispatched };
  }

  #receipt(history: readonly WorkflowEvent[], state: WorkflowReceipt["state"], detail: string): WorkflowReceipt {
    const projection = project(history);
    const started = history[0] as Extract<WorkflowEvent, { kind: "started" }>;
    const outcomes = new Set(["COMPLETED", "DENIED", "CANCELLED", "EXPIRED", "TIMED_OUT", "ACTIVITY_FAILED", "COMPENSATION_FAILED", "FAILED"]);
    return {
      schema: WORKFLOW_RECEIPT_SCHEMA,
      workflowId: started.workflowId,
      intentId: started.intentId,
      state,
      outcome: outcomes.has(state) ? (state as WorkflowReceipt["outcome"]) : null,
      completedActivities: [...projection.completed],
      compensated: projection.completed.includes("compensate"),
      historyLength: history.length,
      detail,
    };
  }

  // SEC-WF-008. Worker shutdown is verified, and a namespace with live workers is a cleanup
  // failure rather than an assumed-clean exit.
  cleanup(): "COMPLETED" | "COMPENSATION_FAILED" {
    if (!this.#port.shutdown()) return "COMPENSATION_FAILED";
    return this.#port.activeWorkers() === 0 ? "COMPLETED" : "COMPENSATION_FAILED";
  }
}
