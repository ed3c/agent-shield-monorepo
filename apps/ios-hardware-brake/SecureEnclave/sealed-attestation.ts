// SEC-SE-007. The one type in this provider that ever holds an attestation blob.
//
// The blob a Secure Enclave attestation carries is not a key, but it is device-identifying and
// it is exactly the sort of value that reaches a log line, an error message that interpolates
// the object, or a receipt field that was added without reading this file. So the bytes live in
// a private field and every escape route JavaScript offers is overridden.
//
// The digest stays readable: it is what the provider binds evidence to, and publishing it costs
// nothing. What cannot leave is the blob itself.

import { createHash } from "node:crypto";

export const REDACTED = "[redacted:sealed-attestation]" as const;

export class SealedAttestation {
  readonly #value: string;
  readonly sha256: string;

  constructor(value: string) {
    this.#value = value;
    this.sha256 = createHash("sha256").update(value).digest("hex");
    Object.freeze(this);
  }

  // The only way to reach the bytes, and only for the duration of the call. A verifier running
  // on the far side of the native boundary needs them; nothing in this repository does.
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
  // which is precisely what a logging line writes. It is pinned by its own control rather than
  // left as dead code.
  toString(): string {
    return REDACTED;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED;
  }

  get [Symbol.toStringTag](): string {
    return "SealedAttestation";
  }

  // Node and Bun both consult this before printing an object, which is how an attestation would
  // otherwise reach a terminal, a CI log or a model's context window.
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}
