# ADR 0022: Quick Action Cross-Device Rollback

Configuration import is transactional at the adapter boundary: invalid or
empty migrated data must not replace a valid snapshot. Target lists are
normalized deterministically so repeated migrations converge, and legacy data
cannot reintroduce executable callback fields.
