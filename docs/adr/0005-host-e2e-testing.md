# ADR-0005: Managed SiYuan host end-to-end tests

## Status

Accepted for the host-test phase; not part of the production plugin bundle.

## Context

The plugin has host-independent unit tests and lightweight CSS smoke tests, but
some regressions only appear after SiYuan has loaded the plugin, restored
persistent state, indexed documents, or broadcast a tab change. A browser
connected to a user's running workspace is not a reproducible test fixture and
must not be used for destructive or persistent-state checks.

SiYuan's `siyuan-testing` project demonstrates a managed local instance: it
starts a kernel and frontend compiler, uses a dedicated workspace and port,
waits for host readiness, serializes shared UI tests, and cleans up processes
and test data even after failures.

## Decision

Add a separate host-e2e layer around the existing tests with these rules:

- The harness owns the SiYuan process and refuses to stop an already-running
  target. Production workspaces are never test workspaces.
- Every test-created document, notebook, setting, and plugin data record is
  tracked and restored or removed in teardown. Failed tests preserve IDs and
  diagnostics for investigation.
- UI tests use one worker per shared SiYuan instance. Only pure API/log tests
  may run concurrently.
- Tests wait on public host state (plugin loaded, index ready, tab broadcast)
  instead of fixed sleeps. Focused and repeat modes are required for flaky
  lifecycle bugs.
- Desktop host tests may use Playwright/CDP. Mobile browser emulation remains
  a structural smoke check only; mobile acceptance requires a real Android
  SiYuan host.
- The production plugin keeps runtime feature detection and does not depend on
  the test harness or its packages.

## Initial coverage

The first host suite should cover plugin load/unload, tab open/close refresh,
layered search and fallback, quick-entry persistence, settings restoration,
Agent capability registration, and stale/timeout request handling. The second
panel will reuse the same fixture only after its module registry and layout
schema are stable.

## Consequences

Host-e2e setup is slower and requires a SiYuan source checkout plus a kernel,
but it provides reproducible evidence for lifecycle and persistence behavior.
The existing unit and smoke gates remain fast and continue to run before the
managed host suite.
