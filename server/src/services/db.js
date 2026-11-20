const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const TMP_FILE = path.join(DATA_DIR, 'db.tmp.json');

// Clean empty schema
const SEED_DATA = {
  users: [],
  trips: [],
  expenses: [],
  settlements: []
};

let cache = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadData() {
  if (cache) return cache;
  ensureDataDir();

  if (!fs.existsSync(DB_FILE)) {
    saveData(SEED_DATA);
    cache = JSON.parse(JSON.stringify(SEED_DATA));
    return cache;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    cache = JSON.parse(raw);
    return cache;
  } catch (err) {
    console.error("Error reading db.json, using clean schema:", err);
    cache = JSON.parse(JSON.stringify(SEED_DATA));
    return cache;
  }
}

function saveData(data) {
  ensureDataDir();
  cache = data;
  const jsonStr = JSON.stringify(data, null, 2);
  // Atomic write: write to temp file then rename
  fs.writeFileSync(TMP_FILE, jsonStr, 'utf-8');
  fs.renameSync(TMP_FILE, DB_FILE);
}

module.exports = {
  getDb: () => loadData(),
  saveDb: (data) => saveData(data),
  resetCache: () => { cache = null; return loadData(); },

  // Users
  getUsers: () => loadData().users,
  getUserById: (id) => loadData().users.find(u => u.id === id),
  addUser: (user) => {
    const db = loadData();
    db.users.push(user);
    saveData(db);
    return user;
  },

  // Trips
  getTrips: () => loadData().trips,
  getTripById: (id) => loadData().trips.find(t => t.id === id),
  createTrip: (trip) => {
    const db = loadData();
    db.trips.unshift(trip);
    saveData(db);
    return trip;
  },
  updateTrip: (id, updates) => {
    const db = loadData();
    const idx = db.trips.findIndex(t => t.id === id);
    if (idx === -1) return null;
    db.trips[idx] = { ...db.trips[idx], ...updates };
    saveData(db);
    return db.trips[idx];
  },

  // Expenses
  getAllExpenses: () => loadData().expenses,
  getExpensesByTrip: (tripId) => loadData().expenses.filter(e => e.tripId === tripId),
  getExpenseById: (id) => loadData().expenses.find(e => e.id === id),
  addExpense: (expense) => {
    const db = loadData();
    db.expenses.unshift(expense);
    saveData(db);
    return expense;
  },
  deleteExpense: (id) => {
    const db = loadData();
    const idx = db.expenses.findIndex(e => e.id === id);
    if (idx === -1) return false;
    db.expenses.splice(idx, 1);
    saveData(db);
    return true;
  },

  // Settlements
  getSettlementsByTrip: (tripId) => loadData().settlements.filter(s => s.tripId === tripId),
  addSettlement: (settlement) => {
    const db = loadData();
    db.settlements.push(settlement);
    saveData(db);
    return settlement;
  }
};
