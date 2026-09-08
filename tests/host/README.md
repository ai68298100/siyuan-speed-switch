# Managed SiYuan host tests

This directory is a host-test contract, not a production dependency. The
runner must start the SiYuan kernel and frontend compiler itself, use a
dedicated workspace and port, and refuse to stop an occupied target.

## Rules

- Use the `siyuan-testing` lifecycle: prepare workspace, validate target,
  start host, wait for readiness, run tests, then stop only owned processes.
- Run shared UI tests with one worker. Parallelism is limited to pure API or
  log checks that do not mutate shared UI state.
- Wait for public readiness (plugin loaded, tab state broadcast, search index)
  instead of relying on fixed sleeps.
- Track every created document, notebook, setting, and plugin record. Remove
  passing data; preserve failed IDs and diagnostics for investigation.
- Desktop browser automation is valid for desktop behavior only. Mobile
  browser emulation is a structural smoke test, not Android acceptance.

The first suite should cover plugin load/unload, tab refresh after open/close,
layered search fallback, settings restoration, quick-entry persistence, and
Agent capability registration. See `config.example.json` for the required
environment contract.

`tests/search-orchestration.test.cjs` is the host-independent contract for the
same layered search flow. It uses a mock transport to verify title-hit
short-circuiting, opened-document ordering, global fallback, cancellation, and
deduplication/limits. A managed-host suite should mirror these cases against
the real SiYuan endpoints once the host harness is available.

`tests/recent-history.test.cjs` similarly covers recent-document storage
normalization and recovery planning without requiring a running host.

`tests/home-adapters.test.cjs` covers the second-panel module contract. It is
skipped in older checkout snapshots that predate `src/home-model.js`, and runs
fully once the main integration branch provides that pure model module.

`tests/recent-closed.test.cjs` defines the closed-document recovery contract:
bounded records, de-duplicated recovery, no fabricated close state, and invalid
documents isolated from valid entries.
