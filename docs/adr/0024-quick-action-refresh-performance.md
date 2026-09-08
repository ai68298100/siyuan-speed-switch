# ADR 0024: Quick Action Refresh Performance Gate

Migration and refresh operate on bounded snapshots. Persisted actions are
limited to twelve entries and provider candidates to a bounded list, while
invalid imports retain the prior valid snapshot. The performance gate checks
that normalization remains comfortably below a one-second budget for large
untrusted inputs.
