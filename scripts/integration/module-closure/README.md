# Module closure resolver

Issue [#66](https://github.com/ed3c/agent-shield-monorepo/issues/66) owns this leaf. It resolves selected modules, components, capability providers, path ownership, interface compatibility and transitive dependencies into a deterministic lock fragment for the [#65](https://github.com/ed3c/agent-shield-monorepo/issues/65) consumer contracts. No Skills or runtime source projection, host adapter, origin or live canary belongs here.

## Determinism

Everything that enters a digest is sorted first, so the lock is a function of the inputs and not of the order they arrived in. The controls prove it by reversing the catalog and by repeating a root — both must produce a byte-identical lock.

## Invalidation is scoped

A module's digest covers its own manifest and its own component digests, and nothing else. Repository `HEAD` is deliberately not an input. Changing an unselected module leaves the closure digest untouched; changing a selected transitive provider moves it, while the digests of unrelated selected modules stay put. All three are controlled.

## Exclusion is by construction

A private component is never bundled even when its module is selected, and an optional one is excluded unless the consumer named it. A tracked file must be a normalized repository-relative path, and `node_modules`, `.git`, `dist`, `build`, `coverage`, `tmp`, `.cache` and `.claude` are refused outright — an owner's live checkout, an absolute path and a traversal all fail the same rule.

## Two rules per subject, two controls

Several checks here look like one rule and are two, and each needed its own control before the plant check would call it load-bearing:

- **file ownership**: exact duplication and prefix nesting are different. The resolver admits a path whose directory component carries an extension, so a nested pair is reachable and has its own control.
- **file digests**: a missing digest and a digest map that disagrees with the file list dominate each other depending on the input. The controls now use one shape where the key is present and malformed, and another where the map carries an extra key.

## Interface compatibility

What the consumer was built against must still be what the release offers — capability, major version, input digest, output digest, exit codes and declared effects, compared as a canonical key. A change to any of them without a version bump is `INTERFACE_CONFLICT`, and all five are separately controlled.

## Failure separation

Absent release, invalid requirements, missing module, missing component, missing capability, duplicate provider, path conflict, interface conflict, cycle and digest mismatch are ten distinct outcomes. A dependency cycle fails rather than resolving to whichever order the walk happened to take.

## Evidence boundary

The resolver reads manifests it is handed. `moduleClosureState` carries no `PASS` and the compiler proves it. Resolver PASS would prove selected bytes and interfaces only — not Skills or runtime source validity, MCP or host adapters, model carriers, origins, provider sessions or live behaviour.

## Human boundary

Module and component selection, compatibility exceptions and interface promotion require Human Admit. Rollback is the exact prior requirements and lock subject.
