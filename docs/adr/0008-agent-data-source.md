# ADR 0008: SiYuan agent data source

The second panel may expose a read-only summary from SiYuan's built-in agent.
The agent integration must use the same adapter snapshot contract as other
sources and declare supported devices explicitly.

- Missing agent APIs or permissions result in an empty module, never a panel
  failure.
- Reads are bounded by the normal adapter timeout and cache policy.
- Agent prompts, raw responses, credentials, and exceptions are not stored in
  diagnostics or panel state.
- Desktop and mobile requests are isolated by the adapter cache key.
- An agent module should expose a concise, bounded summary rather than a full
  transcript; navigation can be added later as a separate action.
