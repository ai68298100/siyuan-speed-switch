# ADR 0189: Side-channel write outcomes and measured performance boundaries

Date: 2026-10-14  
Status: accepted (T-7263)

## Context

Journal creation, quick-capture append, and Gist publish/update are write operations. A timeout, cancellation, 5xx response, or unreadable success receipt cannot prove that the host did not write. Automatic replay can therefore create duplicate journals, blocks, or Gists. The performance request also requires evidence before introducing route splitting, virtual scrolling, image conversion, or font subsetting.

## Decision

- Journal lookup and creation use the shared request service. Lookup permits one bounded retry and latest-wins protection; creation never retries automatically and distinguishes definite failure from an unknown outcome.
- When quick capture has an unknown append outcome, the draft remains visible, the append controls are locked, and the user is told to verify the target document before deciding what to do next. Definite failures remain retryable.
- Gist POST/PATCH cancellation, timeout, network, 5xx, and malformed receipts become `gist-write-unknown`; the draft and remote mapping lock are retained until a manual check. Authentication, permission, 404, and other definite 4xx errors remain readable and retryable.
- Measured limits do not justify virtual scrolling or image/font rewrites: the switcher is capped at 32 tabs, the workbench at 24 items, and the heatmap at 371 cells; first open was 57 ms, 20 warm opens measured p50 13 ms/p95 20 ms, and search filtering p50 261 ms. The studio script is already lazy-loaded; its CSS remains a separate measurement candidate.
- The current build archive is 596337 bytes, 4465 bytes over the repository's 578 KiB (591872-byte) budget. The budget remains unchanged; release waits for reproducible size reduction evidence.

## Verification

- Journal, request-service, Gist, weather, and iCal targeted regressions pass; negative injections for the changed contracts fail precisely and all source hashes were restored.
- `pnpm exec tsc --noEmit` and the production build pass. The full test run has 8698 passes, with the package-budget/readiness assertions failing until the refreshed artifact snapshot is accepted by the release gate.
- No version, tag, or remote branch was changed.
