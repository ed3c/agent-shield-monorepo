// SEC-NFC-006 and SEC-NFC-008. The one type in this provider that ever holds APDU bytes.
//
// A card exchange trace is the most dangerous thing a diagnostic can capture: it carries the
// application identifier, the cryptogram, and on a badly designed scheme enough structure to
// replay. So the bytes live in a private field and every escape route JavaScript offers is
// overridden to return a redaction marker.
//
// This is deliberately a second copy of the same shape used by the Secure Enclave leaf rather
// than a shared module. #59 and #60 are sibling leaves with disjoint path leases, and a shared
// file under `apps/ios-hardware-brake/` would sit in neither lease and couple two PRs that are
// meant to land independently. Fifty lines is the honest price of that independence; the
// convergence issue #64 is where a shared version would belong.

import { createHash } from "node:crypto";

export const REDACTED = "[redacted:sealed-apdu]" as const;

export class SealedApdu {
  readonly #value: string;
  readonly sha256: string;

  constructor(value: string) {
    this.#value = value;
    this.sha256 = createHash("sha256").update(value).digest("hex");
    Object.freeze(this);
  }

  // The only way to reach the bytes, and only for the duration of the call. The native verifier
  // on the far side of the bridge needs them; nothing in this repository does.
  use<T>(consumer: (value: string) => T): T {
    return consumer(this.#value);
  }

  get byteLength(): number {
    return new TextEncoder().encode(this.#value).byteLength;
  }

  toJSON(): string {
    return REDACTED;
  }

  // Reachable only by an explicit call -- Symbol.toPrimitive wins every implicit coercion --
  // which is precisely what a diagnostic logging line writes.
  toString(): string {
    return REDACTED;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED;
  }

  get [Symbol.toStringTag](): string {
    return "SealedApdu";
  }

  // Node and Bun both consult this before printing an object, which is how an APDU trace would
  // otherwise reach a terminal, a CI log or a model's context window.
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}
