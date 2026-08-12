# Eval schema

Each issue defines evals before a Worker creates implementation changes. Use stable IDs scoped to the owning issue or a reusable catalog family.

## Required fields

| Field | Required meaning |
|---|---|
| `id` | stable identifier, unique in the issue/catalog |
| `owner` | issue/module/person or trusted operator responsible for the verdict |
| `requirement_refs` | intent/source/decision IDs this eval protects |
| `subject` | exact files, module closure, release, provider, environment, branch/PR, device, or production observation |
| `preconditions` | immutable ref, fixtures, tools, credentials/session presence states, and clean/isolated state |
| `action` | bounded command or human procedure; no ambiguous “verify everything” |
| `observable` | machine- or human-inspectable condition that decides the assertion |
| `positive_assertion` | what must be true for `PASS` at the named evidence level |
| `negative_control` | planted defect, absence, disagreement, or mutation that must produce a distinguishable red state |
| `artifact` | receipt/report/output schema, path class, digest, and retention owner |
| `exit_states` | mapping among exit codes and `PASS`/`FAIL`/`ABSENT`/`NOT_IMPLEMENTED`/`NOT_EXERCISED` |
| `cleanup` | processes, worktrees, sessions, files, locks, leases, and external resources that must be accounted for |
| `exclusions` | capabilities/environments the eval explicitly does not prove |
| `rollback_subject` | exact commit/release/policy/provider subject used to recover |

## Minimum issue form

```markdown
### E<issue>.<n> — <name>

- Requirement refs:
- Subject:
- Owner:
- Preconditions:
- Action:
- Positive assertion:
- Observable:
- Negative control:
- Artifact/receipt:
- Exit/state semantics:
- Cleanup/residue:
- Exclusions:
- Rollback subject:
```

## PR result form

```markdown
| Eval | Exact subject | Result | Artifact/digest | Exclusions |
|---|---|---|---|---|
| E… | commit/release/provider | PASS/FAIL/ABSENT/NOT_IMPLEMENTED/NOT_EXERCISED | … | … |
```

## Review rules

- The subject cannot silently move from branch head to a later commit.
- `PASS` requires the declared action to run and the negative control to have shown disagreement capability at the required level.
- A live/provider eval includes provider/account/environment identity without secret values.
- A human eval names the reviewer and reviewed subject; human judgment does not replace deterministic checks.
- Any missing required field makes the eval incomplete under `E50.1`.
