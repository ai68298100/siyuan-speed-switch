# ADR 0037: Quick Action Release Candidate Gate

The release-candidate gate combines schema safety and runtime safety: persisted
entries strip callbacks and remote icons, unknown future schemas are isolated,
and imported candidates require a currently registered handler before execution.
