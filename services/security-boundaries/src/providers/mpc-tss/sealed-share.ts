// SEC-TSS-007. The one type in this provider that ever holds share material.
//
// A threshold scheme's whole value is that no single place holds a signing key. That property
// is destroyed by a single accidental serialization -- a log line, a receipt field, an error
// message that interpolates the object, a heap dump collected for an unrelated reason. So the
// bytes live in a private field and every escape route JavaScript offers is overridden to
// return a redaction marker instead.
//
// This is the difference between "we remembered to redact" and "there is nothing to redact
// because the value cannot leave", and only the second one survives a new call site written by
// someone who never read this file.

export const REDACTED = "[redacted:sealed-share]" as const;

export class SealedShare {
  readonly #value: string;
  // The participant and epoch this share belongs to are public facts and stay readable: they
  // are what the provider needs to reason about thresholds and revocation.
  readonly participantId: string;
  readonly epoch: number;

  constructor(participantId: string, epoch: number, value: string) {
    this.#value = value;
    this.participantId = participantId;
    this.epoch = epoch;
    Object.freeze(this);
  }

  // The only way to reach the bytes, and only for the duration of the call.
  use<T>(consumer: (value: string) => T): T {
    return consumer(this.#value);
  }

  get byteLength(): number {
    return new TextEncoder().encode(this.#value).byteLength;
  }

  toJSON(): string {
    return REDACTED;
  }

  toString(): string {
    return REDACTED;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED;
  }

  get [Symbol.toStringTag](): string {
    return "SealedShare";
  }

  // Node and Bun both consult this before printing an object, which is how a share would
  // otherwise reach a terminal, a CI log or a model's context window.
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}
