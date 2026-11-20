/**
 * Corporate Policy & Compliance Verification Engine
 */
function evaluatePolicy(expense, trip) {
  const flags = [];

  // Only check policies for CORPORATE and HYBRID modes
  if (!trip || (trip.mode !== 'CORPORATE' && trip.mode !== 'HYBRID')) {
    return flags;
  }

  const config = trip.corporateConfig || {};
  const perDiem = Number(config.perDiemLimit) || 0;
  const receiptThreshold = Number(config.receiptRequiredThreshold) || 500;
  const amount = Number(expense.amount) || 0;

  // 1. Check Mandatory Receipt Threshold
  if (amount >= receiptThreshold && (!expense.receipt || expense.receipt.trim() === '')) {
    flags.push({
      code: 'RECEIPT_REQUIRED',
      severity: 'WARNING',
      message: `Receipt is mandatory for expenses of ${trip.currencySymbol || '₹'}${receiptThreshold} or higher.`
    });
  }

  // 2. Check Per Diem Limit (for FOOD or DAILY allowances)
  if (perDiem > 0 && expense.category === 'FOOD') {
    const splitCount = (expense.splits && expense.splits.length > 0) ? expense.splits.length : 1;
    const perPersonCost = amount / splitCount;

    if (perPersonCost > perDiem) {
      flags.push({
        code: 'PER_DIEM_EXCEEDED',
        severity: 'WARNING',
        message: `Per-person food share (${trip.currencySymbol || '₹'}${Math.round(perPersonCost)}) exceeds daily allowance limit of ${trip.currencySymbol || '₹'}${perDiem}.`
      });
    }
  }

  // 3. High Value Flag (Single expense > 50% of trip budget)
  if (trip.budget && amount > (trip.budget * 0.5)) {
    flags.push({
      code: 'HIGH_VALUE_CLAIM',
      severity: 'INFO',
      message: `Expense represents over 50% of the entire trip budget.`
    });
  }

  return flags;
}

module.exports = {
  evaluatePolicy
};
