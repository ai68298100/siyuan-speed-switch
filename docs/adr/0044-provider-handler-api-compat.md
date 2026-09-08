# ADR 0044: Provider Handler API Compatibility

The registry wraps synchronous handler results consistently and permits async
results to cross the caller boundary as promises. Synchronous throws and
rejected async operations must be converted to safe failure results by the
host adapter so provider errors never escape into switcher rendering.
