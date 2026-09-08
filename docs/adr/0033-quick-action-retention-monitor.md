# ADR 0033: Quick Action Retention Monitor

Upgrades must remove obsolete or executable fields while preserving valid
entries. Repeated upgrades remain bounded by the persisted action limit, and
invalid records are isolated rather than displacing valid configuration.
