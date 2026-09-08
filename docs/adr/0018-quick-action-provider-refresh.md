# ADR 0018: Quick Action Provider Refresh

Provider lifecycle events publish the current candidate snapshot to each
surface. Registration adds only declared targets, unregister removes all
candidates and handlers, and re-registration replaces the handler atomically.
Presentation state such as collapsed rails is maintained separately and is not
reset by provider refreshes.
