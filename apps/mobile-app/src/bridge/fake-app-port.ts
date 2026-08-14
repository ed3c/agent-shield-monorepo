import type { AppActionPort } from "./types.ts";

// Deterministic in-memory stand-in for the application surface. No React Native, navigation
// stack, store or component tree is involved -- which is the point: the bridge is a protocol
// boundary, and a boundary that can only be tested by booting an app is one that will be
// tested by booting an app, which is to say rarely.
export class FakeAppPort implements AppActionPort {
  responds = true;
  succeeds = true;
  detail = "fixture action applied";
  sessions = 0;
  listeners = 0;
  readonly dispatched: Array<{ actionId: string; args: Record<string, string> }> = [];

  dispatch(actionId: string, args: Record<string, string>): { ok: boolean; detail: string } | null {
    if (!this.responds) return null;
    this.dispatched.push({ actionId, args: { ...args } });
    return { ok: this.succeeds, detail: this.detail };
  }

  openSessions(): number {
    return this.sessions;
  }

  boundListeners(): number {
    return this.listeners;
  }
}
