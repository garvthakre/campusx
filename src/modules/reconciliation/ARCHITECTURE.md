# Reconciliation architecture

The three-tier cascade keeps exact work deterministic and cheap, uses the LLM only when identifiers are ambiguous, and sends failures to a predictable manual-review path. The settlement window is 0 to 7 days because the current synthetic feed intentionally settles one to four days after the internal payment; same-day comparison is retained only as the strict exact tier.

Synthetic ground truth is persisted in `settlement_records.rawMeta.groundTruth`. This makes the false-positive metric reproducible after process restarts. All new outcomes default to `pending_review`; review endpoints update only reconciliation records. No module in this feature updates CampusX opportunity payment state.

The existing payment webhook does not persist a provider transaction ID or a separate payout document. `ledger.adapter.js` therefore derives stable IDs from the existing opportunity ID and payment level until the payment pipeline gains a dedicated ledger model.
