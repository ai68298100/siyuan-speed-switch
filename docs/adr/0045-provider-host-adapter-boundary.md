# ADR 0045: Provider Host Adapter Boundary

The host adapter consumes synchronous and asynchronous provider results through
one normalized shape. Unavailable and failed executions expose stable reason
codes, allowing desktop, sidebar, and mobile UI layers to render consistent
feedback without inspecting provider exceptions.
