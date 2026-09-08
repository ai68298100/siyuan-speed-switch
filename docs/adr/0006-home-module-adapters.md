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
- Adapter registration is last-write-wins and removal is explicit, so plugin
  reloads do not leave stale providers behind.
- Layout normalization is idempotent and removes duplicate or orphan entries.
- Reads have a bounded timeout and short per-device/config caching so a slow
  plugin cannot block the panel or cause repeated refresh storms.
- Built-in and plugin data sources expose the same read-only contract and an
  explicit empty placeholder, so UI code never needs source-specific shape
  checks.
- Failed reads enter a bounded per-module/device backoff. Explicit refresh can
  bypass that backoff, while the last good or empty snapshot remains stable.
