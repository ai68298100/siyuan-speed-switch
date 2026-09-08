# Recent recovery contract

`runRecoveryPlan` preserves the legacy callback shape: a resolved value other
than `false` counts as success, while a thrown error is isolated to that item.
`runRecoveryPlanBounded` adds optional `max` and `AbortSignal`; cancellation
stops before the next item and reports `cancelled: true` without converting
already completed items into failures.
