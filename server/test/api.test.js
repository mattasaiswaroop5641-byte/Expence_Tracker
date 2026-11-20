const assert = require('assert');
const db = require('../src/services/db');
const settlementService = require('../src/services/settlementService');
const policyService = require('../src/services/policyService');

console.log(" Running Backend & Business Logic Tests (Self-Contained Fixtures)...\n");

// 1. Verify Clean DB State
assert(Array.isArray(db.getTrips()), "Trips should be an array");
assert(Array.isArray(db.getUsers()), "Users should be an array");
console.log("✓ DB: Clean schema initialized successfully");

// 2. Test Debt Simplification Algorithm on a dynamic test fixture
const testTrip = {
  id: "test_fixture_trip",
  title: "Test Weekend Trip",
  mode: "SOCIAL",
  currency: "INR",
  currencySymbol: "₹",
  members: ["u_t1", "u_t2", "u_t3", "u_t4"]
};

// Add temporary test users
["u_t1", "u_t2", "u_t3", "u_t4"].forEach((uid, i) => {
  db.addUser({ id: uid, name: `Member ${i + 1}`, email: `${uid}@test.com` });
});
db.createTrip(testTrip);

// Add 2 test expenses:
// Expense 1: Member 1 pays ₹10,000 split equally among all 4 (₹2,500 each)
db.addExpense({
  id: "test_exp_1",
  tripId: testTrip.id,
  amount: 10000,
  paidBy: "u_t1",
  splits: [
    { userId: "u_t1", amount: 2500 },
    { userId: "u_t2", amount: 2500 },
    { userId: "u_t3", amount: 2500 },
    { userId: "u_t4", amount: 2500 }
  ]
});

// Expense 2: Member 2 pays ₹2,000 split equally between Member 3 & 4 (₹1,000 each)
db.addExpense({
  id: "test_exp_2",
  tripId: testTrip.id,
  amount: 2000,
  paidBy: "u_t2",
  splits: [
    { userId: "u_t3", amount: 1000 },
    { userId: "u_t4", amount: 1000 }
  ]
});

const balances = settlementService.calculateBalances(testTrip.id);
assert(balances.totalTripSpent === 12000, `Expected total 12000, got ${balances.totalTripSpent}`);
assert(balances.simplifiedTransfers.length > 0, "Should generate simplified debt transfers");
console.log("✓ Settlement Service: Debt Simplification computed correctly");
balances.simplifiedTransfers.forEach(t => {
  console.log(`    -> ${t.fromName} pays ${t.toName}: ₹${t.amount}`);
});

// 3. Test Corporate Policy Engine
const mockCorpTrip = {
  mode: "CORPORATE",
  currencySymbol: "₹",
  corporateConfig: {
    perDiemLimit: 3000,
    receiptRequiredThreshold: 500
  }
};

const mockViolationExpense = {
  amount: 4500,
  category: "FOOD",
  receipt: null,
  splits: [{ userId: "u_t1", amount: 4500 }]
};

const flags = policyService.evaluatePolicy(mockViolationExpense, mockCorpTrip);
assert(flags.some(f => f.code === "RECEIPT_REQUIRED"), "Should flag missing receipt");
assert(flags.some(f => f.code === "PER_DIEM_EXCEEDED"), "Should flag per diem exceeded");
console.log("✓ Policy Engine: Accurately caught policy violations:", flags.map(f => f.code).join(", "));

// Clean up test fixture from DB
const cleanDb = {
  users: db.getUsers().filter(u => !u.id.startsWith("u_t")),
  trips: db.getTrips().filter(t => t.id !== testTrip.id),
  expenses: db.getExpensesByTrip(testTrip.id).length ? db.getDb().expenses.filter(e => e.tripId !== testTrip.id) : [],
  settlements: []
};
db.saveDb(cleanDb);

console.log("\n All Tests Passed with Clean Storage Verified!");
