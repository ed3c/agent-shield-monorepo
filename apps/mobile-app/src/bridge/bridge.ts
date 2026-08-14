import {
  BRIDGE_RESPONSE_SCHEMA,
  type AppActionPort,
  type BridgeCapability,
  type BridgeConfig,
  type BridgeLifecycleEvent,
  type BridgeLogEntry,
  type BridgeRegistry,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeRouting,
  type BridgeState,
} from "./types.ts";
import type { ProductActionDefinition } from "../../../../packages/contracts/src/product/index.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export function fail(message: string): never {
  throw new Error(`invalid bridge contract: ${message}`);
}

// UX-BRIDGE-002. The registry is compiled from action definitions and nothing else. Building it
// is the only way an action becomes reachable, so there is no "dynamic" path to leave open.
export function compileRegistry(definitions: readonly ProductActionDefinition[]): BridgeRegistry {
  const registry = new Map<string, ProductActionDefinition>();
  for (const definition of definitions) {
    if (!SAFE_ID.test(definition.id)) fail(`action id ${definition.id} is not a portable identifier`);
    if (registry.has(definition.id)) fail(`action ${definition.id} is registered twice`);
    for (const key of definition.allowedArgumentKeys) {
      if (!SAFE_ID.test(key)) fail(`argument key ${key} is not a portable identifier`);
    }
    registry.set(definition.id, definition);
  }
  return registry;
}

// UX-BRIDGE-001. A configuration is refused before anything binds. The binding union already
// makes a public listener unsayable, so what is left is the port itself and the bounds.
export function assertConfig(config: BridgeConfig): BridgeConfig {
  if (config.binding.kind === "loopback") {
    const port = config.binding.port;
    if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) fail("the loopback port is outside the admitted range");
  } else if (!SAFE_ID.test(config.binding.brokerRef)) {
    fail("the broker reference is invalid");
  }
  if (!Number.isSafeInteger(config.maxRequestsPerMinute) || config.maxRequestsPerMinute < 1) fail("maxRequestsPerMinute must be positive");
  if (!Number.isSafeInteger(config.maxArgumentBytes) || config.maxArgumentBytes < 1) fail("maxArgumentBytes must be positive");
  if (!Number.isSafeInteger(config.maxLogEntries) || config.maxLogEntries < 1) fail("maxLogEntries must be positive");
  return config;
}

// UX-BRIDGE-004. Where a request must go when the bridge is not allowed to satisfy it. The
// decision is read off the action definition; there is no argument, header or flag a caller
// could supply to change it, which is what "the bridge cannot self-admit" has to mean to be
// worth anything.
export function routeFor(definition: ProductActionDefinition, capability: BridgeCapability): BridgeRouting | null {
  for (const scope of definition.requiredScopes) {
    if (!capability.scopes.includes(scope)) return "DENIED";
  }
  if (definition.humanAdmitRequired) return "WAITING_FOR_HUMAN";
  if (definition.riskClass === "privileged") return "WAITING_FOR_HARDWARE";
  return null;
}

export class InAppBridge {
  readonly #config: BridgeConfig;
  readonly #registry: BridgeRegistry;
  readonly #port: AppActionPort;
  // UX-BRIDGE-003. Nonces already spent, per session. A replay is a nonce this session has
  // used before, which is why the set is keyed by session rather than global.
  readonly #spentNonces = new Map<string, Set<string>>();
  readonly #recentRequests: number[] = [];
  readonly #log: BridgeLogEntry[] = [];
  #state: BridgeState = "DISABLED";

  constructor(config: BridgeConfig, registry: BridgeRegistry, port: AppActionPort) {
    this.#config = assertConfig(config);
    this.#registry = registry;
    this.#port = port;
  }

  get state(): BridgeState {
    return this.#state;
  }

  // A copy: a caller that could mutate the log could also empty it.
  get log(): readonly BridgeLogEntry[] {
    return this.#log.map((entry) => ({ ...entry }));
  }

  // UX-BRIDGE-001 and UX-BRIDGE-006. Starting is explicit and refuses when disabled, so the
  // default really is closed rather than closed-until-someone-calls-start.
  start(): BridgeState {
    if (!this.#config.enabled) {
      this.#state = "DISABLED";
      return this.#state;
    }
    this.#state = "CONFIG_VALIDATED";
    this.#state = "BOUND_LOCAL";
    this.#state = "AUTHENTICATING";
    this.#state = "READY";
    return this.#state;
  }

  handle(request: BridgeRequest, capability: BridgeCapability, nowEpochMs: number): BridgeResponse {
    const lifecycle: BridgeState[] = [this.#state];
    const settle = (outcome: BridgeState, detail: string, routedTo: BridgeRouting | null = null): BridgeResponse => {
      const response: BridgeResponse = {
        schema: BRIDGE_RESPONSE_SCHEMA,
        actionId: request.actionId,
        lifecycle: [...lifecycle, outcome],
        outcome: outcome as BridgeResponse["outcome"],
        routedTo,
        detail,
      };
      // UX-BRIDGE-005. One entry, four public fields. An argument value or a nonce has no
      // field to occupy here even if a future caller wanted to record one.
      this.#log.push({
        actionId: request.actionId,
        actorId: capability.actorId,
        outcome: response.outcome,
        atEpochMs: nowEpochMs,
      });
      while (this.#log.length > this.#config.maxLogEntries) this.#log.shift();
      // A refusal returns the bridge to READY rather than leaving it mid-transaction; a
      // shutdown failure is the one state that is not recoverable by the next request.
      if (this.#state !== "DISABLED" && outcome !== "FAILED_SHUTDOWN") this.#state = "READY";
      return response;
    };

    if (this.#state !== "READY") {
      return settle("NOT_IMPLEMENTED", "the bridge is not running");
    }

    lifecycle.push("REQUEST_VALIDATING");
    this.#state = "REQUEST_VALIDATING";

    // UX-BRIDGE-003. Identity first: an expired or malformed capability is refused before the
    // request is looked at, so an unauthenticated caller learns nothing about the registry.
    if (!SAFE_ID.test(capability.sessionId)) return settle("AUTH_REFUSED", "the session id is invalid");
    if (!SAFE_ID.test(capability.actorId)) return settle("AUTH_REFUSED", "the actor id is invalid");
    if (capability.expiresAtEpochMs <= nowEpochMs) return settle("AUTH_REFUSED", "the capability has expired");
    if (request.nonce.length < 16) return settle("AUTH_REFUSED", "the request nonce is too short to be unguessable");
    if (!SHA_256.test(request.requestDigest)) return settle("AUTH_REFUSED", "the request digest is not content-addressed");

    const spent = this.#spentNonces.get(capability.sessionId) ?? new Set<string>();
    if (spent.has(request.nonce)) return settle("REPLAY_REFUSED", "this nonce has already been spent in this session");

    // UX-BRIDGE-003 rate. Counted before dispatch, so a flood cannot be absorbed by the app.
    while (this.#recentRequests.length > 0 && nowEpochMs - this.#recentRequests[0]! >= 60_000) this.#recentRequests.shift();
    if (this.#recentRequests.length >= this.#config.maxRequestsPerMinute) {
      return settle("RATE_LIMITED", "the bridge is over its admitted request rate");
    }

    // UX-BRIDGE-002. Unknown actions are refused by absence from the registry, not by a filter
    // that somebody has to keep in step with the registry.
    const definition = this.#registry.get(request.actionId);
    if (definition === undefined) return settle("UNKNOWN_ACTION", "the action is not in the compiled registry");

    const keys = Object.keys(request.arguments);
    for (const key of keys) {
      if (!definition.allowedArgumentKeys.includes(key)) {
        return settle("INVALID_ARGUMENTS", `${key} is not an admitted argument for this action`);
      }
    }
    let bytes = 0;
    for (const value of Object.values(request.arguments)) bytes += new TextEncoder().encode(value).byteLength;
    if (bytes > this.#config.maxArgumentBytes) return settle("INVALID_ARGUMENTS", "the arguments exceed their admitted size");

    lifecycle.push("AUTHORIZING");
    // UX-BRIDGE-004. The gate. Nothing below this line can re-open what it closed.
    const routing = routeFor(definition, capability);
    if (routing !== null) {
      return settle(
        routing === "DENIED" ? "AUTH_REFUSED" : "RISK_REFUSED",
        routing === "DENIED" ? "the capability lacks a required scope" : "this action requires an admission the bridge cannot grant",
        routing,
      );
    }

    // The nonce is spent once the request is authorised, so a refused request cannot be used
    // to burn a nonce an honest caller still needs.
    spent.add(request.nonce);
    this.#spentNonces.set(capability.sessionId, spent);
    this.#recentRequests.push(nowEpochMs);

    lifecycle.push("DISPATCHING");
    const result = this.#port.dispatch(request.actionId, request.arguments);
    if (result === null) return settle("TRANSPORT_FAILED", "the app port did not respond");
    if (!result.ok) return settle("ACTION_FAILED", result.detail);

    return settle("RESPONDING", result.detail);
  }

  // UX-BRIDGE-006. Backgrounding drops the session rather than leaving it warm, so a resumed
  // app re-authenticates instead of inheriting whatever was open when the screen went dark.
  on(event: BridgeLifecycleEvent): BridgeState {
    if (event === "background" || event === "disconnect") {
      this.#spentNonces.clear();
      this.#state = this.#config.enabled ? "AUTHENTICATING" : "DISABLED";
      return this.#state;
    }
    this.#state = this.#state === "AUTHENTICATING" ? "READY" : this.#state;
    return this.#state;
  }

  // UX-BRIDGE-006. Shutdown drains and then checks, rather than announcing a clean stop and
  // leaving a listener bound. A retained listener or session is the failure, not a warning.
  shutdown(): BridgeState {
    this.#state = "DRAINING";
    this.#spentNonces.clear();
    this.#recentRequests.length = 0;
    if (this.#port.openSessions() > 0 || this.#port.boundListeners() > 0) {
      this.#state = "FAILED_SHUTDOWN";
      return this.#state;
    }
    this.#state = "DISABLED";
    return this.#state;
  }
}

// UX-BRIDGE-008. A store-compliance claim cannot come from this repository. The function exists
// so that the answer is a value a caller must handle rather than a paragraph in a README that
// nobody reads before shipping.
export function storeComplianceEvidence(): "NOT_EXERCISED" {
  return "NOT_EXERCISED";
}
