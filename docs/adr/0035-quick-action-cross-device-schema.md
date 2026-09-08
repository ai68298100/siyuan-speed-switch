# ADR 0035: Quick Action Cross-Device Schema Migration

Schema version one packages must import deterministically on desktop, sidebar,
and mobile. Legacy or missing packages fall back to safe defaults, while a
normalize/serialize round trip preserves order, targets, and other bounded
fields without drift.
