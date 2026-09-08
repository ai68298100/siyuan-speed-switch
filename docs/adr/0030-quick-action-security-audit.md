# ADR 0030: Quick Action Security Audit

Release review treats imported entries and provider metadata as untrusted.
Persisted actions contain only bounded serializable fields; callback, secret,
and arbitrary object fields are discarded. Handler failures return a stable
reason without exposing exception objects, and malformed provider actions cannot
expand the registry surface.
