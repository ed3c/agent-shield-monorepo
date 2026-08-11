import type { ProductAdapterReceipt } from "../../../packages/contracts/src/index.ts";

export const adapters = [
  { adapter: "expo-mobile", state: "NOT_EXERCISED", environment: "local-cloud", detail: "Expo contract exists; no device build or store artifact was exercised" },
  { adapter: "maestro", state: "NOT_EXERCISED", environment: "local-cloud", detail: "Maestro flow contract exists; no simulator/device run was exercised" },
  { adapter: "wda", state: "NOT_EXERCISED", environment: "local", detail: "iOS WebDriverAgent requires a trusted macOS host" },
  { adapter: "scrcpy", state: "NOT_EXERCISED", environment: "local", detail: "Android projection requires a trusted ADB host" },
  { adapter: "cloud-ios", state: "NOT_IMPLEMENTED", environment: "cloud", detail: "No cloud macOS runner provider is bound" },
] as const satisfies readonly ProductAdapterReceipt[];

export function adapterReceipt(id: string): ProductAdapterReceipt {
  return adapters.find((candidate) => candidate.adapter === id) ?? { adapter: id, state: "ABSENT", environment: "local", detail: "adapter is not registered" };
}
