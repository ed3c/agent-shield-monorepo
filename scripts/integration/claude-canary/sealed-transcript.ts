// INT-CLAUDE-007. The one type that ever holds model output.
//
// A transcript is the whole reason this receipt has to be careful: it contains whatever the
// model said, which may quote the repository, the prompt, or anything the tool call returned.
// None of that is evidence -- the evidence is the exit code, the digests and whether the
// predicate held -- so the text lives in a private field and every escape route is overridden.

import { createHash } from "node:crypto";

export const REDACTED = "[redacted:transcript]" as const;

export class SealedTranscript {
  readonly #value: string;
  readonly sha256: string;

  constructor(value: string) {
    this.#value = value;
    this.sha256 = createHash("sha256").update(value).digest("hex");
    Object.freeze(this);
  }

  // The only way to reach the text, and only for the duration of the call. A human debugging a
  // failed canary on their own machine needs it; nothing this repository produces does.
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
  // which is exactly what a "canary failed: " + transcript line writes.
  toString(): string {
    return REDACTED;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED;
  }

  get [Symbol.toStringTag](): string {
    return "SealedTranscript";
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}
