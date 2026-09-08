# ADR 0029: Quick Action Sync Conflict

Cross-device quick-action snapshots merge by stable entry ID. A later incoming
entry deterministically replaces the same ID, independent entries retain order,
and malformed or empty incoming snapshots cannot erase a valid local state.
