# Web dashboard contract

## Owner

- Module: `product-adapters`
- Interface: `1.0.0`
- Capability: `product.dashboard/v1`
- Future primary stack: Bun + TypeScript with a Next.js-compatible product adapter

## Purpose

This directory defines the future operator-facing dashboard boundary: structured status views, bounded Generative UI, terminal/session observation, Human Admit, and links to immutable artifacts. The current file is a state contract, not a running web application.

## Inputs

- typed module, provider, risk, and product receipts;
- immutable artifact references and bounded metadata;
- explicit operator identity and authorization from a future IAM boundary;
- bettor-generated MCP/driver status after exact initialization.

## Outputs

- read-only status and evidence views by default;
- bounded precompiled actions where an implementation issue explicitly admits them;
- Human Admit or refusal receipts;
- terminal/session references without embedding credentials or raw host paths.

## Current evidence

| Subject | State |
|---|---|
| dashboard contract | present |
| GenUI rendering | `NOT_EXERCISED` |
| terminal/PTY surface | `NOT_EXERCISED` |
| bettor MCP initialization | `NOT_INITIALIZED` / integration `NOT_EXERCISED` |
| signed-in browser transport | `NOT_EXERCISED` |
| cloud dashboard deployment | `NOT_IMPLEMENTED` |

## Non-goals and prohibitions

- No generic terminal or shell command is exposed through MCP.
- No UI component may convert missing evidence into success.
- Do not stream secret-bearing process environments, browser profiles, tokens, or device sessions.
- Do not treat Xterm.js, Next.js, shadcn/ui, or Vercel AI SDK package presence as a product receipt.
- Product actions may not bypass risk policy, hardware gates, or Human Admit.

## Required eval families before implementation

- receipt-to-UI state fidelity;
- missing/failed artifact rendering;
- authorization refusal and CSRF/session controls;
- bounded terminal output and disconnect/reconnect behavior;
- planted stale-status and misleading-success defects;
- browser, build, deploy, cleanup, and accessibility receipts.

Issue #19 owns this README only. The implementation remains a later, eval-first product issue.