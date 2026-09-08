# ADR 0007: Home refresh and diagnostics API

## Scope

The second panel keeps data providers independent from UI rendering. The
adapter layer exposes four stable boundaries:

- `readHomeModule(adapters, moduleId, device, config, options)` reads a bounded
  read-only snapshot. It supports timeout, cache TTL and `force` refresh.
- `planHomeRefresh(state)` returns a pure refresh decision for visibility,
  device, staleness, failure and force state.
- `planHomeLifecycleRefresh(event, state)` maps panel, tab and device events to
  the same decision model. Unknown or malformed events are ignored safely.
- `getHomeAdapterDiagnostics()` and `consumeHomeAdapterDiagnostics(device)`
  expose bounded diagnostic records without raw errors or provider payloads.

## Regression matrix

The home adapter test suite covers device capability filtering, empty snapshots,
timeouts, cache and force refresh, failure backoff, lifecycle event coalescing,
diagnostic capacity, concurrent reads, unregister cleanup, and malformed input.
Any future adapter integration should add tests for its declared devices and
failure behavior before touching the UI integration layer.

## Performance budget

Snapshots are capped at 24 items, diagnostics at 32 records, reads have a
bounded timeout, and repeated refresh events are coalesced. Mobile refreshes
use a conservative delay and hidden panels never refresh.
