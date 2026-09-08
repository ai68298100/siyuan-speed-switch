# ADR 0036: Quick Action Schema Final Regression

The final cross-device regression requires schema round trips to be idempotent,
unknown fields and malformed entries to be discarded, and missing package data
to resolve deterministically to safe defaults.
