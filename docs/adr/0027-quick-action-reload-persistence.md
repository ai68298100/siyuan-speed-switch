# ADR 0027: Quick Action Reload Persistence

Provider unload/reload cycles must not mutate persisted action data. Callback
functions remain runtime-only, while action order and declared targets are
stable across reloads. Malformed persisted provider entries are discarded in
isolation so valid entries continue to load.
