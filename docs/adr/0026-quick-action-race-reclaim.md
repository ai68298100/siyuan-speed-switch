# ADR 0026: Quick Action Race Reclaim

Provider unregister and re-registration are atomic from the candidate
consumer's perspective. Unregister clears all snapshots before a later refresh;
duplicate registration keeps one provider and the latest handler; stale
candidate objects resolve through the current provider lifecycle and cannot
retain old callbacks.
