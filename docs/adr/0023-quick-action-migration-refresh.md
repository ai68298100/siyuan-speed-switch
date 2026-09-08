# ADR 0023: Quick Action Migration Refresh

After importing migrated configuration, providers re-register against the
normalized metadata and publish one fresh candidate snapshot. Old callbacks are
discarded before re-registration, and all surfaces derive their visible
candidates from the same snapshot to prevent cross-device drift.
