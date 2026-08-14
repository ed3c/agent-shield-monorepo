import {
  admitProductAction,
  validateProductAction,
  type ProductAction,
  type ProductActionDefinition,
} from "../../../packages/contracts/src/product/index.ts";
import { fail } from "./view-model.ts";
import type { DashboardSubject, OperatorIdentity } from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;

export interface DashboardActionRequest {
  action: unknown;
  subject: DashboardSubject;
  csrfToken: string;
}

// UX-WEB-003. Replay is refused by remembering the nonces this session has already spent.
// The set is the session's, not the caller's, so a caller cannot clear it by re-sending.
export class DashboardSession {
  readonly #spentNonces = new Set<string>();
  readonly #operator: OperatorIdentity;
  readonly #subject: DashboardSubject;

  constructor(operator: OperatorIdentity, subject: DashboardSubject) {
    if (!SHA_256.test(operator.sessionCsrfToken)) fail("operator session CSRF token is invalid");
    this.#operator = { ...operator, scopes: [...operator.scopes].sort() };
    this.#subject = subject;
  }

  get operator(): OperatorIdentity {
    return { ...this.#operator, scopes: [...this.#operator.scopes] };
  }

  // UX-WEB-004. The action is parsed by the shared product contract, so an arbitrary URL,
  // command, file, prompt, tool or navigation string cannot enter here at all. This function
  // adds only the surface concerns: CSRF, subject binding, operator scope and replay.
  dispatch(
    request: DashboardActionRequest,
    catalog: ReadonlyMap<string, ProductActionDefinition>,
    nowEpochMs: number,
  ): ProductAction {
    if (request.csrfToken !== this.#operator.sessionCsrfToken) fail("dashboard action failed the CSRF check");
    if (request.subject.commit !== this.#subject.commit || request.subject.releaseDigest !== this.#subject.releaseDigest) {
      fail("dashboard action targets a different subject than the session");
    }
    const action = validateProductAction(request.action);
    if (action.authorization.actorId !== this.#operator.actorId || action.authorization.actorKind !== this.#operator.actorKind) {
      fail("dashboard action was authorized for a different operator");
    }
    for (const scope of action.authorization.scopes) {
      if (!this.#operator.scopes.includes(scope)) fail(`operator does not hold scope: ${scope}`);
    }
    if (this.#spentNonces.has(action.authorization.nonce)) fail("dashboard action nonce was already spent");
    const definition = admitProductAction(action, catalog, nowEpochMs);
    if (definition.humanAdmitRequired) {
      // The dashboard never grants Human Admit on the operator's behalf; it can only surface
      // that the action is waiting for one.
      fail(`action ${definition.id} requires Human Admit and cannot be dispatched from the dashboard`);
    }
    this.#spentNonces.add(action.authorization.nonce);
    return action;
  }
}
