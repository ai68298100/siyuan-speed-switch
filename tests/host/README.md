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
