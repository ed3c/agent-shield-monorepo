// UX-EXPO-007. The one type in this app that ever holds build output.
//
// A build log carries the signing identity, the provisioning profile, the certificate common
// name, the device UDIDs on the profile and the host paths the toolchain ran under. All of that
// is host-owned, and none of it may reach Git, a portable receipt, a CI log or a model's
// context window. So the text lives in a private field and every escape route is overridden.

import { createHash } from "node:crypto";

export const REDACTED = "[redacted:build-log]" as const;

export class SealedBuildLog {
  readonly #value: string;
  readonly sha256: string;

  constructor(value: string) {
    this.#value = value;
    this.sha256 = createHash("sha256").update(value).digest("hex");
    Object.freeze(this);
  }

  // The only way to reach the text, and only for the duration of the call. A developer looking
  // at a failed build on their own machine needs it; nothing this repository produces does.
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
  // which is exactly what a "build failed: " + log line writes.
  toString(): string {
    return REDACTED;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED;
  }

  get [Symbol.toStringTag](): string {
    return "SealedBuildLog";
  }

  // Node and Bun both consult this before printing an object.
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}
