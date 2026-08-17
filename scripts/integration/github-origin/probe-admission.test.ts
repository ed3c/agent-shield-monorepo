import { describe, expect, test } from "bun:test";
import { classifyOriginProbe } from "./probe-admission.ts";

describe("GitHub origin probe admission", () => {
  test("admits an explicitly public readable origin without claiming authentication", () => {
    expect(classifyOriginProbe({ reachable: true, authenticated: false, refused: false, publiclyReadable: true })).toBe("REACHABLE");
  });

  test("does not infer public readability from reachability alone", () => {
    expect(classifyOriginProbe({ reachable: true, authenticated: false, refused: false })).toBe("AUTH_ABSENT");
  });

  test("keeps refusal and absence distinct", () => {
    expect(classifyOriginProbe({ reachable: false, authenticated: false, refused: false })).toBe("ORIGIN_ABSENT");
    expect(classifyOriginProbe({ reachable: true, authenticated: true, refused: true })).toBe("AUTH_REFUSED");
  });

  test("admits authenticated private-origin access without public readability", () => {
    expect(classifyOriginProbe({ reachable: true, authenticated: true, refused: false })).toBe("REACHABLE");
  });
});
