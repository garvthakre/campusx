import Opportunity from "../opportunity/opportunity.model.js";

// The current CampusX webhook stores payment state on Opportunity, not a payout collection.
// This adapter is read-only and gives reconciliation a stable ledger-shaped view.
export async function readLedgerRecords() {
  const opportunities = await Opportunity.find({
    $or: [
      { "paymentStatus.firstPayment.status": true },
      { "paymentStatus.secondPayment.status": true },
    ],
  }).lean();

  return opportunities.flatMap((opportunity) => {
    const records = [];
    for (const [level, payment] of Object.entries(opportunity.paymentStatus || {})) {
      if (payment?.status && payment.date) {
        records.push({
          ledgerRecordId: `${opportunity._id}:${level}`,
          transactionId: `${opportunity._id}:${level}`,
          amount: Number(opportunity.amount || 0) * 0.5,
          currency: "INR",
          timestamp: new Date(payment.date),
          userId: opportunity.createdBy?.id || null,
          status: "success",
        });
      }
    }
    return records;
  });
}
