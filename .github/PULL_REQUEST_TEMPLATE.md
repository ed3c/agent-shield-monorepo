## Issue and stack

- Closes: #
- Epic: #
- Parent PR/branch:
- Child PRs:
- Exact head SHA:

```text
main
└── parent
    └── this-branch
```

## Goal

<!-- State one reviewable outcome. -->

## Path lease

- Allowed paths:
- Excluded paths:
- Module IDs / interface versions:

## Evals designed before implementation

| Eval ID | Subject | Preconditions | Action | Observable | Negative control | Artifact | Expected state |
|---|---|---|---|---|---|---|---|
| E??.? | | | | | | | |

## Evidence boundary

<!-- Name capabilities, providers, environments, sessions, devices, or downstream systems this PR does not prove. -->

- States allowed to change:
- States that must remain unchanged:
- `NOT_IMPLEMENTED` remaining:
- `NOT_EXERCISED` remaining:

## Results

- Deterministic checks:
- Negative/mutation controls:
- Live canaries:
- Cleanup/residue:
- Generated artifacts and digests:

## Stacked-PR checks

- [ ] issue contained evals before code/docs were written
- [ ] parent branch/PR is correct
- [ ] changed paths fit the declared lease
- [ ] sibling PRs have no undeclared overlapping writable paths
- [ ] stack was dry-run synchronized
- [ ] stack was synchronized with rebase strategy
- [ ] semantic conflicts were not resolved unattended
- [ ] exact head passed required CI
- [ ] parent will merge before this PR

## Security and licensing

- [ ] no secret, cookie, profile, device session, private key, `.env`, or host path entered Git or artifacts
- [ ] new dependencies have exact-version direct and transitive license review
- [ ] no generic shell-over-MCP was added
- [ ] no prose or package presence was promoted to PASS

## Merge/handoff

<!-- State the next safe human-owned action after review. -->
