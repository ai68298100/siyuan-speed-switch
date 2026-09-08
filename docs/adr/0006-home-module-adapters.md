# ADR 0006: Second-panel module adapters

## Decision

The second panel stores only bounded module instances and layout metadata. Data
providers are registered as read-only adapters with an explicit device list.
Adapters return a small snapshot (`title`, bounded `items`, optional timestamp)
and are isolated behind a failure boundary.

## Rationale

This keeps integrations with SiYuan and other plugins independent from the
panel state. A missing host API, unsupported mobile capability, or malformed
third-party payload must produce an empty module instead of breaking the panel.
The adapter protocol also gives future integrations such as check-in, data
assets, light talk, SQL summaries, and task lists one consistent entry point.

## Constraints

- Device support is explicit; adapters are never assumed to work on mobile.
- Snapshots are capped and text is sanitized before rendering.
- Adapter failures are converted to a local failure result.
- Unknown module instances and layouts are discarded during migration.
