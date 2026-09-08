# ADR 0012: Quick Action Provider Release Gate

Before release, provider entries must pass one combined contract: declared
surface capabilities are explicit, candidate records are JSON-safe and bounded,
unknown icons resolve to a core fallback, and unregister/re-register cycles do
not retain stale callbacks. Mobile support is never inferred for ordinary
commands; providers must declare it.
