# Mobile application contract

## Owner

- Module: `product-adapters`
- Interface: `1.0.0`
- Capability: `product.mobile/v1`
- Future primary tooling: Bun + TypeScript
- On-device runtime boundary: Hermes or JavaScriptCore, not Bun

## Purpose

This directory holds the React Native/Expo product contract for an eventual iOS and Android application. The current source file declares framework, tooling, accessibility, External Maestro, and In-App MCP states; it is not a built application.

## Inputs

- typed product and security contracts from `packages/contracts`;
- runtime-provider receipts from `runtime.provider/v1`;
- precompiled action definitions and content-addressed artifacts;
- host-supplied simulator/device/session state through a dedicated adapter.

## Outputs

- typed UI/action requests;
- accessibility/test identifiers;
- bounded product-adapter receipts and artifact references;
- user-visible waiting, refusal, failure, and completion states.

## Current evidence

| Subject | State |
|---|---|
| Expo/React Native contract | present |
| Bun + TypeScript tooling contract | present |
| iOS/Android build | `NOT_EXERCISED` |
| External Maestro run | `NOT_EXERCISED` |
| In-App MCP bridge | `NOT_IMPLEMENTED` |
| Store-distribution/compliance evidence | `NOT_EXERCISED` |
| cloud mobile provider | `NOT_IMPLEMENTED` |

## Non-goals and prohibitions

- Do not claim Bun executes inside the shipped mobile application.
- Do not expose arbitrary shell, file-system, or downloaded-code execution.
- Do not start an unauthenticated production listener.
- Do not infer App Store/Play compliance from source prose.
- Do not put local-network credentials, device IDs, profiles, certificates, or signing material in Git.
- Do not couple directly to WDA, ADB, scrcpy, Maestro, or cloud-device internals; use typed adapter receipts.

## Required eval families before implementation

- deterministic action/schema validation;
- accessibility-ID mutation control;
- absent simulator/device distinction;
- local and cloud route independence;
- authentication/authorization refusal;
- artifact and cleanup receipts;
- store-policy verification against the exact release design.

Issue #19 owns this README only. Product implementation requires a later issue and exact provider evidence.