import type {
  ProductActionDefinition,
  ProductActorKind,
} from "../../../../packages/contracts/src/product/index.ts";

export const BRIDGE_RESPONSE_SCHEMA = "agent-shield/in-app-bridge-response/v1" as const;

export type BridgeState =
  | "DISABLED"
  | "CONFIG_VALIDATED"
  | "BOUND_LOCAL"
  | "AUTHENTICATING"
  | "READY"
  | "REQUEST_VALIDATING"
  | "AUTHORIZING"
  | "DISPATCHING"
  | "RESPONDING"
  | "DRAINING"
  | "NOT_IMPLEMENTED"
  | "AUTH_REFUSED"
  | "REPLAY_REFUSED"
  | "UNKNOWN_ACTION"
  | "INVALID_ARGUMENTS"
  | "RISK_REFUSED"
  | "RATE_LIMITED"
  | "TRANSPORT_FAILED"
  | "ACTION_FAILED"
  | "FAILED_SHUTDOWN";

export type BridgeOutcome = Extract<BridgeState,
  | "RESPONDING"
  | "NOT_IMPLEMENTED"
  | "AUTH_REFUSED"
  | "REPLAY_REFUSED"
  | "UNKNOWN_ACTION"
  | "INVALID_ARGUMENTS"
  | "RISK_REFUSED"
  | "RATE_LIMITED"
  | "TRANSPORT_FAILED"
  | "ACTION_FAILED"
  | "FAILED_SHUTDOWN">;

// UX-BRIDGE-001. The two surfaces the architecture admits. There is no host, address or
// interface field anywhere in this union, so an unauthenticated `0.0.0.0` listener is not a
// configuration this bridge can be talked into -- it is a sentence the type cannot form.
export type BridgeBinding =
  | { kind: "loopback"; port: number }
  | { kind: "brokered"; brokerRef: string };

export interface BridgeConfig {
  // UX-BRIDGE-001. Default disabled. An absent decision is a closed bridge, not an open one.
  enabled: boolean;
  binding: BridgeBinding;
  maxRequestsPerMinute: number;
  maxArgumentBytes: number;
  // UX-BRIDGE-005. The log is bounded by construction; the oldest entries fall off rather than
  // the process growing a transcript of everything an operator ever did.
  maxLogEntries: number;
}

// UX-BRIDGE-003. Who is asking, under what session, with what scopes, until when.
export interface BridgeCapability {
  actorKind: ProductActorKind;
  actorId: string;
  sessionId: string;
  scopes: string[];
  expiresAtEpochMs: number;
}

// UX-BRIDGE-002. A request names an action from the compiled registry and supplies admitted
// argument keys. There is no `method`, `module`, `url`, `script`, `command`, `path` or `code`
// field, so "download and run this" has nowhere to arrive.
export interface BridgeRequest {
  actionId: string;
  arguments: Record<string, string>;
  // UX-BRIDGE-003. The nonce is what makes a replay detectable; the digest is what binds the
  // framed bytes to the request that was authorised.
  nonce: string;
  requestDigest: string;
  issuedAtEpochMs: number;
}

// UX-BRIDGE-004. Where a refusal sends the caller. These are product states, not bridge
// states: the bridge routes to a gate it does not own and cannot satisfy on its own.
export type BridgeRouting = "WAITING_FOR_HUMAN" | "WAITING_FOR_HARDWARE" | "DENIED";

export interface BridgeResponse {
  schema: typeof BRIDGE_RESPONSE_SCHEMA;
  actionId: string;
  lifecycle: BridgeState[];
  outcome: BridgeOutcome;
  // Populated only when the refusal is a routing decision, so "refused" and "refused, and here
  // is who must decide next" are different answers rather than the same one read two ways.
  routedTo: BridgeRouting | null;
  detail: string;
}

// UX-BRIDGE-005. What a log entry is allowed to contain. There is no field for an argument
// value, a nonce, a digest or a token, so redaction is a property of the shape rather than a
// step someone has to remember at each call site.
export interface BridgeLogEntry {
  actionId: string;
  actorId: string;
  outcome: BridgeOutcome;
  atEpochMs: number;
}

// UX-BRIDGE-006. The lifecycle events the host app drives. Backgrounding is explicit because a
// bridge that keeps a session alive through it is the one that surprises people.
export type BridgeLifecycleEvent = "background" | "foreground" | "disconnect";

// The app-side surface a dispatched action reaches. This is the only way the bridge touches
// the application, and it is deliberately not the app itself: no navigation stack, no store,
// no component tree, nothing that would drag a React Native dependency into a boundary whose
// whole job is to be checkable without one.
export interface AppActionPort {
  dispatch(actionId: string, args: Record<string, string>): { ok: boolean; detail: string } | null;
  openSessions(): number;
  boundListeners(): number;
}

export type BridgeRegistry = ReadonlyMap<string, ProductActionDefinition>;
