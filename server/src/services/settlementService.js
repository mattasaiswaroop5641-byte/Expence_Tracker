const db = require('./db');

/**
 * Calculates net balances and minimal debt settlement transfers
 * using a Greedy Graph Simplification Algorithm.
 */
function calculateBalances(tripId) {
  const trip = db.getTripById(tripId);
  if (!trip) return null;

  const expenses = db.getExpensesByTrip(tripId);
  const settlements = db.getSettlementsByTrip(tripId);
  const allUsers = db.getUsers();

  // Initialize balance dictionary for all trip members
  const memberBalances = {};
  const memberSpent = {}; // Total money paid out of pocket
  const memberShare = {}; // Total fair share owed

  trip.members.forEach(mId => {
    memberBalances[mId] = 0;
    memberSpent[mId] = 0;
    memberShare[mId] = 0;
  });

  let totalTripSpent = 0;

  // Process expenses
  expenses.forEach(exp => {
    const amount = Number(exp.amount) || 0;
    totalTripSpent += amount;

    // Credit payer
    if (memberBalances[exp.paidBy] !== undefined) {
      memberBalances[exp.paidBy] += amount;
      memberSpent[exp.paidBy] += amount;
    }

    // Debit split participants
    if (Array.isArray(exp.splits)) {
      exp.splits.forEach(split => {
        const splitAmt = Number(split.amount) || 0;
        if (memberBalances[split.userId] !== undefined) {
          memberBalances[split.userId] -= splitAmt;
          memberShare[split.userId] += splitAmt;
        }
      });
    }
  });

  // Process historical settlements (repayments already made)
  settlements.forEach(stl => {
    const amt = Number(stl.amount) || 0;
    if (memberBalances[stl.fromUser] !== undefined) {
      memberBalances[stl.fromUser] += amt; // paid off debt, balance rises toward 0
    }
    if (memberBalances[stl.toUser] !== undefined) {
      memberBalances[stl.toUser] -= amt; // received debt, balance decreases toward 0
    }
  });

  // Format members summary
  const membersSummary = trip.members.map(mId => {
    const user = allUsers.find(u => u.id === mId) || { id: mId, name: mId, avatar: '' };
    const net = Math.round((memberBalances[mId] || 0) * 100) / 100;
    return {
      userId: mId,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      upiId: user.upiId,
      role: user.role,
      totalPaid: Math.round((memberSpent[mId] || 0) * 100) / 100,
      totalShare: Math.round((memberShare[mId] || 0) * 100) / 100,
      netBalance: net // > 0: gets back money, < 0: owes money
    };
  });

  // Run Debt Simplification
  const debtors = [];
  const creditors = [];

  membersSummary.forEach(m => {
    if (m.netBalance < -0.01) {
      debtors.push({ userId: m.userId, name: m.name, upiId: m.upiId, balance: m.netBalance });
    } else if (m.netBalance > 0.01) {
      creditors.push({ userId: m.userId, name: m.name, upiId: m.upiId, balance: m.netBalance });
    }
  });

  // Sort debtors ascending (most negative first) and creditors descending (most positive first)
  debtors.sort((a, b) => a.balance - b.balance);
  creditors.sort((a, b) => b.balance - a.balance);

  const simplifiedTransfers = [];
  let dIdx = 0;
  let cIdx = 0;

  // Work on copies
  const dList = debtors.map(d => ({ ...d }));
  const cList = creditors.map(c => ({ ...c }));

  while (dIdx < dList.length && cIdx < cList.length) {
    const debtor = dList[dIdx];
    const creditor = cList[cIdx];
    const amountToTransfer = Math.min(-debtor.balance, creditor.balance);

    if (amountToTransfer > 0.01) {
      const roundedAmt = Math.round(amountToTransfer * 100) / 100;
      simplifiedTransfers.push({
        fromUser: debtor.userId,
        fromName: debtor.name,
        toUser: creditor.userId,
        toName: creditor.name,
        toUpiId: creditor.upiId,
        amount: roundedAmt,
        currency: trip.currency || 'INR',
        currencySymbol: trip.currencySymbol || '₹',
        upiPaymentUrl: creditor.upiId ? `upi://pay?pa=${encodeURIComponent(creditor.upiId)}&pn=${encodeURIComponent(creditor.name)}&am=${roundedAmt}&cu=${trip.currency || 'INR'}&tn=${encodeURIComponent('Settle ' + trip.title)}` : null
      });

      debtor.balance += amountToTransfer;
      creditor.balance -= amountToTransfer;
    }

    if (Math.abs(debtor.balance) < 0.01) dIdx++;
    if (Math.abs(creditor.balance) < 0.01) cIdx++;
  }

  return {
    tripId,
    totalTripSpent: Math.round(totalTripSpent * 100) / 100,
    currency: trip.currency,
    currencySymbol: trip.currencySymbol,
    membersSummary,
    simplifiedTransfers,
    completedSettlements: settlements
  };
}

module.exports = {
  calculateBalances
};
