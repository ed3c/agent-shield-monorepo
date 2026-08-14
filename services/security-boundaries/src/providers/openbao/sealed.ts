// SEC-BAO-002. The one type in this adapter that ever holds a secret value.
//
// It cannot be serialized, printed, interpolated or spread into anything: every escape route
// JavaScript offers is overridden to return a redaction marker, and the value itself lives in
// a private field that no consumer can reach. A consumer runs a callback under `use`, and the
// value exists only for the duration of that call.
//
// This is the difference between "we remembered to redact the logs" and "there is no way to
// get the bytes out", which is the only version of this rule that survives a new call site.

export const REDACTED = "[redacted:sealed-secret]" as const;

export class SealedSecret {
  readonly #value: string;
  readonly ref: string;

  constructor(ref: string, value: string) {
    this.#value = value;
    this.ref = ref;
    Object.freeze(this);
  }

  use<T>(consumer: (value: string) => T): T {
    return consumer(this.#value);
  }

  // A digest is the only derived fact this type will hand out, and it is one-way.
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
    return "SealedSecret";
  }

  // Node and Bun both consult this before printing an object.
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}
