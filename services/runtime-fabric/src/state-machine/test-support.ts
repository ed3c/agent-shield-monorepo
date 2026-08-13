export function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`RT-FND ${message}`);
}

export function red(action: () => unknown, message: string): void {
  let failed = false;
  try { action(); } catch { failed = true; }
  ok(failed, `${message} stayed green`);
}

export async function redAsync(action: () => Promise<unknown>, message: string): Promise<void> {
  let failed = false;
  try { await action(); } catch { failed = true; }
  ok(failed, `${message} stayed green`);
}
