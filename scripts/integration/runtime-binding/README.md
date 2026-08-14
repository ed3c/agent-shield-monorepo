# Runtime binding resolver

Issue [#68](https://github.com/ed3c/agent-shield-monorepo/issues/68) owns this leaf. It resolves the selected `runtime-env` modules, profile, fixed workloads and per-carrier policies into a secret-free immutable consumer binding. No canonical upstream source is changed, and the consumer copies no `.env`, Keychain, OAuth, browser or device session.

## There is no field for a value

A variable declares a name, whether it is secret, whether it is required, and a default that only a non-secret may have. The type has no value field, so a binding cannot carry a credential even by accident, and a secret cannot carry a default because there is nowhere for one to live.

That is enforced by shape. What is enforced by scanning is everything else: the rendered binding is checked for credential-shaped values, host paths and never-copied files (`.env`, keychains, cookie stores, PEM and P12). The controls plant eleven different shapes and require the scan to catch each — a scan that cannot fail proves nothing.

## A digest check must not mask the rules behind it

Verification runs four rules: schema, binding digest, secret scan, and a per-carrier projection recomputation. Every forgery a control can build also invalidates the digest, so **the digest rule would stand in front of all three others** and they would never be exercised.

Each control therefore **reseals** its forgery — recomputing the binding digest after tampering — so the rule under test is the one that fires. That is why `bindingDigestOf` is exported: a consumer needs it, and a control needs it more.

Resealing immediately found a real defect. The projection check compared only `projectionDigest`, so a forged projection that left the stored digest untouched matched on digest alone — accepting exactly the tampering the check existed to catch. It now compares the whole rendered projection.

## Two rules, two outcomes

A path that names a host location and a path that is merely malformed are different defects. Collapsing them into one rule made whichever check ran second untestable, so entrypoints and config paths each report `HOST_PATH_DETECTED` or a conflict outcome depending on which is true.

## Carrier isolation

Each carrier owns its own config paths, and a path claimed by two carriers is a conflict rather than a merge — a shared path is exactly how one carrier's session becomes visible to another. A carrier receives only the variable names its own policy admits, intersected with what the selected workloads actually declare, so widening a policy cannot leak a name no workload uses.

## Workload closure

A workload names a checked-in entrypoint and the exact variable names it receives. There is no command, argv or trailing-arguments field, so a generic command surface cannot be expressed. Network policy and host list must agree, and a workload declaring a name the profile does not is a conflict.

## Evidence boundary

Verification is a pure function of the binding bytes: no network, no sibling checkout, no filesystem, no automatic sync. `runtimeBindingState` carries no `PASS` and the compiler proves it. Binding PASS would prove secret-free contract bytes only — not host value presence, carrier authentication, provider availability or live workload execution.

## Human boundary

Canonical runtime module, profile, workload and policy changes, host value setup, secret rotation, permission or network widening, and binding promotion require Human Admit.
