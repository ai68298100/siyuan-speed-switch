# ADR 0025: Quick Action Provider Memory Boundary

Provider candidate publication is bounded to 64 entries per snapshot. Repeated
refreshes must be idempotent and cannot accumulate duplicate candidates.
Unregistering a provider releases its candidate snapshot and callback so stale
entries cannot retain memory or execute later.
