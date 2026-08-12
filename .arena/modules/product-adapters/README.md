# product-adapters module

- Interface: `1.0.0`
- Roots: `apps/mobile-app`, `apps/web-dashboard`, `services/mobile-automation`
- Provides: `product.mobile/v1`, `product.dashboard/v1`, `product.automation/v1`
- Requires: `runtime.provider/v1`
- Runtime: local `NOT_EXERCISED`; cloud `NOT_IMPLEMENTED`
- External exposure: false; secrets: host-only

This module owns product-surface and automation state contracts. No app build, dashboard deployment, simulator/device, Maestro, WDA, scrcpy, signed-in session, or cloud iOS provider is proven by the manifest.

Child READMEs define local inputs, outputs, non-goals, and required evals. Host-only credentials and sessions never become module bytes.