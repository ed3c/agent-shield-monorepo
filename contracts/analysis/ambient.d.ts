// Minimal ambient declarations for this leaf, in the same hand-rolled style as
// `types/node-shim.d.ts` and for the same reason: pulling in `@types/node`, `bun-types` or
// `@types/solc` would put a `devDependencies` field in `package.json`, which is exactly what
// `contracts.test.ts` asserts is absent.
//
// Kept inside `contracts/` rather than added to `types/node-shim.d.ts` because #62's path lease
// is `contracts/**`, and `types/` belongs to whoever owns the shared shim.

interface ImportMeta {
  /** Bun: true when this module is the entry point. */
  main: boolean;
  /** Bun: the directory containing this module. */
  dir: string;
}

// solc-js ships no types and is acquired transiently by the workflow, never declared. Only the
// two members this leaf calls are described -- a wider declaration would be a claim about an
// interface nothing here verifies.
declare module "solc" {
  const solc: {
    version(): string;
    compile(input: string): string;
  };
  export default solc;
}
