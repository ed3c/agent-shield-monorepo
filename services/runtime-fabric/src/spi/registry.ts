import type {
  RuntimeProviderDescriptor,
  RuntimeRequest,
} from "../../../../packages/contracts/src/runtime/index.ts";
import { normalizeDescriptor } from "./validation.ts";
import type { RuntimeProviderSpi } from "./types.ts";

export class RuntimeProviderRegistry {
  readonly #providers = new Map<string, RuntimeProviderSpi>();

  constructor(providers: readonly RuntimeProviderSpi[] = []) {
    for (const provider of providers) this.register(provider);
  }

  register(provider: RuntimeProviderSpi): void {
    const descriptor = normalizeDescriptor(provider.descriptor);
    if (this.#providers.has(descriptor.id)) {
      throw new Error(`runtime provider is already registered: ${descriptor.id}`);
    }
    const bound: RuntimeProviderSpi = {
      descriptor,
      admit: provider.admit.bind(provider),
      materialize: provider.materialize.bind(provider),
      execute: provider.execute.bind(provider),
      collect: provider.collect.bind(provider),
      cleanup: provider.cleanup.bind(provider),
      cleanupFailedMaterialization:
        provider.cleanupFailedMaterialization.bind(provider),
    };
    this.#providers.set(descriptor.id, bound);
  }

  resolve(
    providerId: string,
    scope: RuntimeRequest["scope"],
  ): RuntimeProviderSpi | null {
    const provider = this.#providers.get(providerId) ?? null;
    if (provider && provider.descriptor.scope !== scope) {
      throw new Error("registered provider scope does not match request scope");
    }
    return provider;
  }

  descriptors(): RuntimeProviderDescriptor[] {
    return [...this.#providers.values()]
      .map((provider) => ({
        ...provider.descriptor,
        subject: { ...provider.descriptor.subject },
        environmentSubject: { ...provider.descriptor.environmentSubject },
        capabilities: [...provider.descriptor.capabilities],
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }
}
