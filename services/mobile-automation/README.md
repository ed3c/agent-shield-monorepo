# Mobile automation service contract

## Owner

- Module: `product-adapters`
- Interface: `1.0.0`
- Capability: `product.automation/v1`
- Requires: `runtime.provider/v1`
- External exposure: denied; secrets: host-only

## Purpose

Report the availability and evidence state of mobile build, test, projection, and device adapters. This directory does not contain a working simulator/device broker.

## Current adapter catalog

| Adapter | Environment | State |
|---|---|---|
| Expo mobile | local/cloud | `NOT_EXERCISED` |
| Maestro | local/cloud | `NOT_EXERCISED` |
| WDA | trusted local macOS | `NOT_EXERCISED` |
| scrcpy | trusted local ADB host | `NOT_EXERCISED` |
| cloud iOS | cloud | `NOT_IMPLEMENTED` |
| unknown adapter | explicit request | `ABSENT` |

## Inputs

- exact adapter ID and platform;
- immutable app/build artifact;
- explicit simulator/device subject and host-owned session;
- bounded action/test flow with stable accessibility IDs;
- runtime-provider receipt.

## Outputs

`ProductAdapterReceipt` plus content-addressed logs, screenshots, video, JUnit, metadata, and cleanup evidence when a later implementation runs.

## Non-goals and prohibitions

- No simulator/device/session is inferred from configuration.
- No local WDA/ADB port is exposed publicly without authentication and authorization.
- No arbitrary remote script or downloaded executable action.
- No provisioning profile, signing key, device credential, browser profile, or host path enters Git/MCP/artifacts.
- A Maestro YAML file or accessibility ID declaration is not an E2E `PASS`.

## Required eval families before implementation

- app artifact/platform identity;
- accessibility-ID mutation and stale-build controls;
- simulator/device absent, boot failure, test failure, and assertion failure separation;
- bounded input and authenticated projection;
- local/cloud independence and fallback refusal;
- screenshot/video/JUnit integrity;
- WDA/ADB/Maestro process, port, simulator, and worktree cleanup.

Issue #19 owns this README only. Adapter execution remains `NOT_EXERCISED` or `NOT_IMPLEMENTED`.