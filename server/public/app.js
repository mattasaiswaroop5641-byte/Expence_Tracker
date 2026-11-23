/**
 * Omnivance Ledger — Frontend Application
 * Unified Expense Tracker with Dual-Engine (Node.js & GitHub Pages LocalStorage)
 */

const state = {
  trips: [],
  currentTrip: null,
  users: [],
  expenses: [],
  allTripsExpenses: [],
  balances: null,
  activeTab: 'expenses',
  categoryFilter: 'ALL',
  allExpensesScope: 'CURRENT', // 'CURRENT' | 'ALL_TRIPS'
  allExpensesSearch: '',
  currentUser: 'u_alex', // Default simulated active session user
  pendingReceiptData: null, // { name, dataUrl, size, type }
  pendingLocation: null, // { lat, lng, name }
  adminStats: null,
  adminSettings: null,
  auditLogs: []
};

const API_BASE = '/api';

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadInitialData();
});

async function loadInitialData() {
  try {
    await Promise.all([fetchUsers(), fetchTrips()]);
    if (state.trips.length > 0) {
      await selectTrip(state.trips[0].id);
    } else {
      renderEmptyState();
    }
  } catch (err) {
    showToast('Failed to load application data', 'error');
    console.error(err);
  }
}

function renderEmptyState() {
  state.currentTrip = null;
  const homeView = document.getElementById('homeView');
  if (homeView) homeView.classList.add('hidden');
  document.getElementById('noTripsContainer').classList.remove('hidden');
  document.getElementById('activeTripDashboard').classList.add('hidden');
  document.getElementById('tripSelector').innerHTML = `<option disabled selected>No Trips Yet</option>`;
  document.getElementById('currentTripModeBadge').className = 'hidden';
  if (window.lucide) lucide.createIcons();
}

const isClientOnly = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

// Local storage database for GitHub Pages & offline fallback
const localDb = {
  load() {
    try {
      const stored = localStorage.getItem('omnivance_ledger_db');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!parsed.auditLogs) parsed.auditLogs = [];
        if (!parsed.settings) {
          parsed.settings = {
            defaultPerDiemLimit: 3000,
            defaultReceiptRequiredThreshold: 500,
            currency: 'INR',
            currencySymbol: '₹'
          };
        }
        return parsed;
      }
    } catch (e) {}
    return {
      users: [],
      trips: [],
      expenses: [],
      settlements: [],
      auditLogs: [],
      settings: {
        defaultPerDiemLimit: 3000,
        defaultReceiptRequiredThreshold: 500,
        currency: 'INR',
        currencySymbol: '₹'
      }
    };
  },
  save(data) {
    try {
      localStorage.setItem('omnivance_ledger_db', JSON.stringify(data));
    } catch (e) {}
  },
  addAuditLog(action, details) {
    const db = localDb.load();
    if (!db.auditLogs) db.auditLogs = [];
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      action,
      details,
      timestamp: new Date().toISOString()
    };
    db.auditLogs.unshift(entry);
    if (db.auditLogs.length > 100) db.auditLogs = db.auditLogs.slice(0, 100);
    localDb.save(db);
    return entry;
  }
};

function clientCalculateBalances(tripId) {
  const db = localDb.load();
  const trip = db.trips.find(t => t.id === tripId);
  if (!trip) return null;
  const expenses = db.expenses.filter(e => e.tripId === tripId);
  const settlements = db.settlements.filter(s => s.tripId === tripId);

  const memberBalances = {};
  const memberSpent = {};
  const memberShare = {};

  (trip.members || []).forEach(mId => {
    memberBalances[mId] = 0;
    memberSpent[mId] = 0;
    memberShare[mId] = 0;
  });

  let totalTripSpent = 0;
  expenses.forEach(exp => {
    const amount = Number(exp.amount) || 0;
    totalTripSpent += amount;
    if (memberBalances[exp.paidBy] !== undefined) {
      memberBalances[exp.paidBy] += amount;
      memberSpent[exp.paidBy] += amount;
    }
    (exp.splits || []).forEach(split => {
      const splitAmt = Number(split.amount) || 0;
      if (memberBalances[split.userId] !== undefined) {
        memberBalances[split.userId] -= splitAmt;
        memberShare[split.userId] += splitAmt;
      }
    });
  });

  settlements.forEach(stl => {
    const amt = Number(stl.amount) || 0;
    if (memberBalances[stl.fromUser] !== undefined) memberBalances[stl.fromUser] += amt;
    if (memberBalances[stl.toUser] !== undefined) memberBalances[stl.toUser] -= amt;
  });

  const membersSummary = (trip.members || []).map(mId => {
    const user = db.users.find(u => u.id === mId) || { id: mId, name: mId, avatar: '', phone: '', upiId: '' };
    const net = Math.round((memberBalances[mId] || 0) * 100) / 100;
    return {
      userId: mId,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      avatar: user.avatar,
      upiId: user.upiId,
      totalPaid: Math.round((memberSpent[mId] || 0) * 100) / 100,
      totalShare: Math.round((memberShare[mId] || 0) * 100) / 100,
      netBalance: net
    };
  });

  const debtors = membersSummary.filter(m => m.netBalance < -0.01).map(d => ({ ...d })).sort((a, b) => a.netBalance - b.netBalance);
  const creditors = membersSummary.filter(m => m.netBalance > 0.01).map(c => ({ ...c })).sort((a, b) => b.netBalance - a.netBalance);

  const simplifiedTransfers = [];
  let dIdx = 0, cIdx = 0;
  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const amt = Math.min(-debtor.netBalance, creditor.netBalance);
    if (amt > 0.01) {
      const rounded = Math.round(amt * 100) / 100;
      simplifiedTransfers.push({
        fromUser: debtor.userId,
        fromName: debtor.name,
        toUser: creditor.userId,
        toName: creditor.name,
        toUpiId: creditor.upiId,
        amount: rounded,
        currency: trip.currency || 'INR',
        currencySymbol: trip.currencySymbol || '₹',
        upiPaymentUrl: creditor.upiId ? `upi://pay?pa=${encodeURIComponent(creditor.upiId)}&pn=${encodeURIComponent(creditor.name)}&am=${rounded}&cu=${trip.currency || 'INR'}&tn=${encodeURIComponent('Settle ' + trip.title)}` : null
      });
      debtor.netBalance += amt;
      creditor.netBalance -= amt;
    }
    if (Math.abs(debtor.netBalance) < 0.01) dIdx++;
    if (Math.abs(creditor.netBalance) < 0.01) cIdx++;
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

function clientEvaluatePolicy(expense, trip) {
  const flags = [];
  if (!trip || (trip.mode !== 'CORPORATE' && trip.mode !== 'HYBRID')) return flags;
  const cfg = trip.corporateConfig || {};
  const perDiem = Number(cfg.perDiemLimit) || 0;
  const threshold = Number(cfg.receiptRequiredThreshold) || 500;
  const amt = Number(expense.amount) || 0;

  if (amt >= threshold && (!expense.receipt && !expense.receiptData)) {
    flags.push({ code: 'RECEIPT_REQUIRED', severity: 'WARNING', message: `Receipt mandatory for business expenses ≥ ${trip.currencySymbol || '₹'}${threshold}` });
  }
  if (perDiem > 0 && expense.category === 'FOOD') {
    const count = (expense.splits && expense.splits.length) ? expense.splits.length : 1;
    const perPerson = amt / count;
    if (perPerson > perDiem) {
      flags.push({ code: 'PER_DIEM_EXCEEDED', severity: 'WARNING', message: `Per-person food share (${trip.currencySymbol || '₹'}${Math.round(perPerson)}) exceeds daily allowance cap (${trip.currencySymbol || '₹'}${perDiem})` });
    }
  }
  return flags;
}

// Universal API fetcher with automatic fallback to localStorage
async function api(path, options = {}) {
  if (!isClientOnly) {
    try {
      const res = await fetch(`${API_BASE}${path}`, options);
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('API unreachable, falling back to local client database:', e);
    }
  }

  // Client-side fallback handler
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const db = localDb.load();

  // Users
  if (path === '/users' && method === 'GET') return db.users;
  if (path === '/users' && method === 'POST') {
    const newUser = {
      id: `u_${Date.now()}`,
      name: body.name,
      email: body.email || '',
      phone: body.phone ? body.phone.trim() : '',
      upiId: body.upiId ? body.upiId.trim() : '',
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(body.name)}`,
      role: body.role || 'EMPLOYEE'
    };
    db.users.push(newUser);
    localDb.save(db);
    localDb.addAuditLog('USER_CREATED', `User "${newUser.name}" (${newUser.role}) created`);
    return newUser;
  }
  if (path.startsWith('/users/') && method === 'PUT') {
    const uid = path.split('/')[2];
    const idx = db.users.findIndex(u => u.id === uid);
    if (idx !== -1) {
      db.users[idx] = { ...db.users[idx], ...body };
      localDb.save(db);
      localDb.addAuditLog('USER_UPDATED', `User "${db.users[idx].name}" updated`);
      return db.users[idx];
    }
    return null;
  }
  if (path.startsWith('/users/') && method === 'DELETE') {
    const uid = path.split('/')[2];
    const existing = db.users.find(u => u.id === uid);
    db.users = db.users.filter(u => u.id !== uid);
    localDb.save(db);
    localDb.addAuditLog('USER_DELETED', `User "${existing ? existing.name : uid}" removed`);
    return { success: true };
  }

  // Trips
  if (path === '/trips' && method === 'GET') return db.trips;
  if (path === '/trips' && method === 'POST') {
    let finalMemberIds = [];
    if (Array.isArray(body.memberNames)) {
      body.memberNames.forEach(raw => {
        const name = String(raw).trim();
        if (!name) return;
        let u = db.users.find(user => user.name.toLowerCase() === name.toLowerCase());
        if (!u) {
          u = {
            id: `u_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`,
            name,
            email: `${name.toLowerCase()}@example.com`,
            phone: '',
            avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(name)}`,
            upiId: '',
            role: 'EMPLOYEE'
          };
          db.users.push(u);
        }
        if (!finalMemberIds.includes(u.id)) finalMemberIds.push(u.id);
      });
    }

    const newTrip = {
      id: `trip_${Date.now()}`,
      title: body.title,
      mode: body.mode || 'SOCIAL',
      destination: body.destination || '',
      budget: Number(body.budget) || 0,
      currency: 'INR',
      currencySymbol: '₹',
      members: finalMemberIds.length > 0 ? finalMemberIds : ['u_default'],
      status: 'ACTIVE',
      corporateConfig: (body.mode === 'CORPORATE' || body.mode === 'HYBRID') ? {
        costCenter: (body.corporateConfig && body.corporateConfig.costCenter) || 'CORP-GEN',
        perDiemLimit: Number(body.corporateConfig && body.corporateConfig.perDiemLimit) || 3000,
        receiptRequiredThreshold: 500,
        approvalStatus: 'DRAFT'
      } : null
    };
    db.trips.unshift(newTrip);
    localDb.save(db);
    localDb.addAuditLog('TRIP_CREATED', `Trip "${newTrip.title}" (${newTrip.mode}) created`);
    return newTrip;
  }

  if (path.startsWith('/trips/') && method === 'GET') {
    const parts = path.split('/');
    const tripId = parts[2];
    if (parts.length === 3) return db.trips.find(t => t.id === tripId);
    if (parts[3] === 'expenses') return db.expenses.filter(e => e.tripId === tripId);
    if (parts[3] === 'balances') return clientCalculateBalances(tripId);
  }

  if (path.startsWith('/trips/') && path.endsWith('/toggle-end') && method === 'POST') {
    const tripId = path.split('/')[2];
    const trip = db.trips.find(t => t.id === tripId);
    if (trip) {
      trip.status = trip.status === 'ENDED' ? 'ACTIVE' : 'ENDED';
      trip.endedAt = trip.status === 'ENDED' ? new Date().toISOString() : null;
      localDb.save(db);
      localDb.addAuditLog('TRIP_STATUS_CHANGE', `Trip "${trip.title}" status changed to ${trip.status}`);
      return trip;
    }
    return null;
  }

  if (path.startsWith('/trips/') && method === 'DELETE') {
    const tripId = path.split('/')[2];
    const trip = db.trips.find(t => t.id === tripId);
    db.trips = db.trips.filter(t => t.id !== tripId);
    db.expenses = db.expenses.filter(e => e.tripId !== tripId);
    db.settlements = db.settlements.filter(s => s.tripId !== tripId);
    localDb.save(db);
    localDb.addAuditLog('TRIP_DELETED', `Trip "${trip ? trip.title : tripId}" deleted`);
    return { success: true };
  }

  // Expenses
  if (path.startsWith('/trips/') && path.endsWith('/expenses') && method === 'POST') {
    const tripId = path.split('/')[2];
    const trip = db.trips.find(t => t.id === tripId);
    if (trip && trip.status === 'ENDED') {
      throw new Error('This trip is concluded and locked. Reopen the trip in order to record new expenses.');
    }

    const amount = Number(body.amount) || 0;
    const splitMembers = Array.isArray(body.splits) ? body.splits : (trip ? trip.members : []);
    const count = splitMembers.length || 1;
    const share = Math.round((amount / count) * 100) / 100;
    let remainder = Math.round((amount - (share * count)) * 100) / 100;

    const splits = splitMembers.map((uid, idx) => ({
      userId: uid,
      amount: idx === 0 ? Math.round((share + remainder) * 100) / 100 : share
    }));

    const newExp = {
      id: `exp_${Date.now()}`,
      tripId,
      title: body.title,
      amount,
      currency: 'INR',
      date: body.date || new Date().toISOString().split('T')[0],
      category: body.category || 'OTHER',
      paidBy: body.paidBy,
      splitType: 'EQUAL',
      splits,
      receipt: body.receipt || (body.receiptData ? (body.receiptName || 'receipt') : null),
      receiptData: body.receiptData || null,
      location: body.location || null,
      notes: body.notes || '',
      policyFlags: []
    };
    newExp.policyFlags = clientEvaluatePolicy(newExp, trip);
    db.expenses.unshift(newExp);
    localDb.save(db);
    localDb.addAuditLog('EXPENSE_ADDED', `Expense "${newExp.title}" (₹${newExp.amount}) recorded in "${trip ? trip.title : tripId}"`);
    return newExp;
  }

  if (path.startsWith('/trips/') && path.endsWith('/settle') && method === 'POST') {
    const tripId = path.split('/')[2];
    const newSettle = {
      id: `stl_${Date.now()}`,
      tripId,
      fromUser: body.fromUser,
      toUser: body.toUser,
      amount: Number(body.amount) || 0,
      date: new Date().toISOString(),
      reference: body.reference || 'Settlement'
    };
    db.settlements.push(newSettle);
    localDb.save(db);
    localDb.addAuditLog('SETTLEMENT_RECORDED', `Settlement of ₹${newSettle.amount} recorded`);
    return { settlement: newSettle, updatedBalances: clientCalculateBalances(tripId) };
  }

  if (path.startsWith('/trips/') && path.endsWith('/approve') && method === 'POST') {
    const tripId = path.split('/')[2];
    const trip = db.trips.find(t => t.id === tripId);
    if (trip && trip.corporateConfig) {
      trip.corporateConfig.approvalStatus = body.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      localDb.save(db);
      localDb.addAuditLog('CORPORATE_APPROVAL', `Trip "${trip.title}" corporate report ${trip.corporateConfig.approvalStatus}`);
    }
    return { trip };
  }

  if (path.startsWith('/expenses/') && method === 'DELETE') {
    const expId = path.split('/')[2];
    const exp = db.expenses.find(e => e.id === expId);
    db.expenses = db.expenses.filter(e => e.id !== expId);
    localDb.save(db);
    localDb.addAuditLog('EXPENSE_DELETED', `Expense "${exp ? exp.title : expId}" deleted`);
    return { success: true };
  }

  if (path === '/expenses' && method === 'GET') return db.expenses;

  // Admin Routes
  if (path === '/admin/stats' && method === 'GET') {
    const trips = db.trips || [];
    const users = db.users || [];
    const expenses = db.expenses || [];
    const settlements = db.settlements || [];
    const totalVolume = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    return {
      totalTrips: trips.length,
      activeTrips: trips.filter(t => t.status !== 'ENDED').length,
      endedTrips: trips.filter(t => t.status === 'ENDED').length,
      totalUsers: users.length,
      totalExpenses: expenses.length,
      totalVolume: Math.round(totalVolume * 100) / 100,
      totalSettlements: settlements.length
    };
  }

  if (path === '/admin/audit-logs' && method === 'GET') {
    return (db.auditLogs || []).slice(0, 50);
  }

  if (path === '/admin/settings' && method === 'GET') {
    return db.settings || { defaultPerDiemLimit: 3000, defaultReceiptRequiredThreshold: 500, currency: 'INR', currencySymbol: '₹' };
  }

  if (path === '/admin/settings' && method === 'POST') {
    db.settings = { ...(db.settings || {}), ...body };
    localDb.save(db);
    localDb.addAuditLog('SETTINGS_UPDATED', 'Global corporate expense policies updated');
    return db.settings;
  }

  if (path === '/admin/backup' && method === 'GET') {
    return db;
  }

  if (path === '/admin/restore' && method === 'POST') {
    if (body.data && Array.isArray(body.data.users) && Array.isArray(body.data.trips)) {
      localDb.save(body.data);
      localDb.addAuditLog('DATABASE_RESTORED', `Database restored from backup: ${body.data.trips.length} trips, ${body.data.users.length} users`);
      return { success: true };
    }
    throw new Error('Invalid backup schema');
  }

  if ((path === '/reset' || path === '/admin/reset') && method === 'POST') {
    const clean = {
      users: [],
      trips: [],
      expenses: [],
      settlements: [],
      auditLogs: [{
        id: `log_${Date.now()}`,
        action: 'SYSTEM_RESET',
        details: 'System cleared to fresh empty workspace',
        timestamp: new Date().toISOString()
      }],
      settings: {
        defaultPerDiemLimit: 3000,
        defaultReceiptRequiredThreshold: 500,
        currency: 'INR',
        currencySymbol: '₹'
      }
    };
    localDb.save(clean);
    return { message: 'Database reset to clean state' };
  }

  return {};
}

// ==================== API HELPERS ====================

async function fetchUsers() {
  state.users = await api('/users');
}

async function fetchTrips() {
  state.trips = await api('/trips');
  renderTripSelector();
}


function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function renderHomeView() {
  state.currentTrip = null;

  const dashboard = document.getElementById('activeTripDashboard');
  const noTrips = document.getElementById('noTripsContainer');
  const homeView = document.getElementById('homeView');

  if (dashboard) dashboard.classList.add('hidden');
  if (noTrips) noTrips.classList.add('hidden');
  if (homeView) homeView.classList.remove('hidden');

  renderTripSelector();

  let allExpenses = [];
  try {
    allExpenses = (await api('/expenses')) || [];
  } catch (e) {
    allExpenses = state.expenses || [];
  }

  const activeTrips = state.trips.filter(t => t.status !== 'ENDED');
  const endedTrips = state.trips.filter(t => t.status === 'ENDED');
  const totalSpend = allExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const uniqueMembers = new Set();
  state.trips.forEach(t => (t.members || []).forEach(m => uniqueMembers.add(m)));

  // Populate Quick Metrics Ribbon
  const metricActive = document.getElementById('homeMetricActiveTrips');
  if (metricActive) metricActive.textContent = activeTrips.length;

  const metricEnded = document.getElementById('homeMetricEndedTrips');
  if (metricEnded) metricEnded.textContent = endedTrips.length;

  const metricMembers = document.getElementById('homeMetricTotalMembers');
  if (metricMembers) metricMembers.textContent = uniqueMembers.size || state.users.length;

  const metricSpend = document.getElementById('homeMetricTotalSpend');
  if (metricSpend) {
    metricSpend.textContent = '₹' + totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const badgeActive = document.getElementById('homeActiveTripsCountBadge');
  if (badgeActive) badgeActive.textContent = `${activeTrips.length} Active`;

  const badgeEnded = document.getElementById('homeEndedTripsCountBadge');
  if (badgeEnded) badgeEnded.textContent = `${endedTrips.length} Concluded`;

  // Map expenses to trips
  const tripSpendMap = {};
  allExpenses.forEach(e => {
    tripSpendMap[e.tripId] = (tripSpendMap[e.tripId] || 0) + (Number(e.amount) || 0);
  });

  // Render Active Trips Grid
  const activeGrid = document.getElementById('homeActiveTripsGrid');
  if (activeGrid) {
    if (activeTrips.length === 0) {
      activeGrid.innerHTML = `
        <div class="col-span-full card-cream p-8 text-center rounded-3xl border border-dashed border-cream-400">
          <div class="w-12 h-12 rounded-2xl bg-cream-200 text-stone-500 mx-auto flex items-center justify-center mb-3">
            <i data-lucide="compass" class="w-6 h-6"></i>
          </div>
          <h4 class="text-stone-900 font-bold text-base">No active trips currently</h4>
          <p class="text-xs text-stone-500 mt-1 max-w-sm mx-auto">Create a brand new trip or reopen a past concluded trip to start logging split expenses.</p>
          <button onclick="document.getElementById('btnHomeCreateTrip').click()" class="mt-4 btn-rose-primary px-5 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2 shadow-sm">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
            <span>Create New Trip</span>
          </button>
        </div>
      `;
    } else {
      activeGrid.innerHTML = activeTrips.map(t => {
        const spent = tripSpendMap[t.id] || 0;
        const budget = Number(t.budget) || 0;
        const percent = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;
        const isOver = budget > 0 && spent > budget;
        const tagClass = t.mode === 'CORPORATE' ? 'tag-mode-corporate' : (t.mode === 'HYBRID' ? 'tag-mode-hybrid' : 'tag-mode-social');
        const modeLabel = t.mode === 'CORPORATE' ? 'Corporate' : (t.mode === 'HYBRID' ? 'Hybrid' : 'Friends');
        const membersList = (t.members || []).map(mid => state.users.find(u => u.id === mid) || { id: mid, name: mid, avatar: 'https://api.dicebear.com/7.x/notionists/svg?seed=' + mid });

        return `
          <div class="card-cream rounded-3xl p-5 border border-cream-300 hover:border-roseaccent-300 hover:shadow-lg transition-all duration-200 flex flex-col justify-between group">
            <div>
              <div class="flex items-center justify-between gap-2 mb-3">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold ${tagClass}">
                  <span class="w-1.5 h-1.5 rounded-full ${t.mode === 'CORPORATE' ? 'bg-roseaccent-600' : (t.mode === 'HYBRID' ? 'bg-amber-600' : 'bg-emerald-600')}"></span>
                  ${modeLabel}
                </span>
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  ACTIVE
                </span>
              </div>

              <h3 class="text-lg font-bold text-stone-900 group-hover:text-roseaccent-700 transition line-clamp-1">${escapeHtml(t.title)}</h3>
              <p class="text-xs text-stone-500 mt-1 flex items-center gap-1">
                <i data-lucide="map-pin" class="w-3.5 h-3.5 text-stone-400"></i>
                <span>${t.destination ? escapeHtml(t.destination) : 'No destination'}</span>
              </p>

              <!-- Budget Progress -->
              <div class="mt-4 p-3.5 rounded-2xl bg-white/70 border border-cream-200">
                <div class="flex items-center justify-between text-xs mb-1.5">
                  <span class="text-stone-500 font-medium">Spent vs Budget</span>
                  <span class="font-bold ${isOver ? 'text-roseaccent-700' : 'text-stone-800'}">
                    ₹${spent.toLocaleString()} / ₹${budget.toLocaleString()}
                  </span>
                </div>
                <div class="w-full h-2 rounded-full bg-cream-200 overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-300 ${isOver ? 'bg-roseaccent-600' : 'bg-emerald-500'}" style="width: ${percent}%;"></div>
                </div>
                ${isOver ? `<div class="mt-1.5 text-[10px] font-bold text-roseaccent-700 flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3 h-3"></i> Budget exceeded by ₹${(spent - budget).toLocaleString()}</div>` : ''}
              </div>

              <!-- Members Stack -->
              <div class="mt-4 flex items-center justify-between">
                <div class="flex items-center -space-x-2">
                  ${membersList.slice(0, 4).map(m => `
                    <img src="${m.avatar}" alt="${escapeHtml(m.name)}" title="${escapeHtml(m.name)}" class="w-7 h-7 rounded-full border-2 border-white bg-cream-200 shadow-xs object-cover" />
                  `).join('')}
                  ${membersList.length > 4 ? `
                    <div class="w-7 h-7 rounded-full border-2 border-white bg-cream-300 text-stone-700 text-[10px] font-bold flex items-center justify-center shadow-xs">
                      +${membersList.length - 4}
                    </div>
                  ` : ''}
                </div>
                <span class="text-xs font-semibold text-stone-500">${membersList.length} members</span>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="mt-5 pt-4 border-t border-cream-200/80 flex items-center gap-2">
              <button onclick="window.selectTrip('${t.id}')" class="flex-1 btn-rose-primary py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm">
                <span>Open Dashboard</span>
                <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="window.promptEndTrip('${t.id}')" class="px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-cream-300 text-stone-700 hover:text-stone-900 hover:bg-cream-100 transition shadow-sm" title="End and Conclude Trip">
                <span>End</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Render Past & Concluded Trips Grid
  const endedGrid = document.getElementById('homeEndedTripsGrid');
  if (endedGrid) {
    if (endedTrips.length === 0) {
      endedGrid.innerHTML = `
        <div class="col-span-full card-cream p-6 text-center rounded-3xl border border-dashed border-cream-300">
          <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 mx-auto flex items-center justify-center mb-2">
            <i data-lucide="check-circle" class="w-5 h-5"></i>
          </div>
          <h4 class="text-stone-800 font-bold text-sm">No concluded trips yet</h4>
          <p class="text-xs text-stone-500 mt-1">When an outing concludes, clicking End Trip locks the ledger and places the summary here.</p>
        </div>
      `;
    } else {
      endedGrid.innerHTML = endedTrips.map(t => {
        const spent = tripSpendMap[t.id] || 0;
        const tagClass = t.mode === 'CORPORATE' ? 'tag-mode-corporate' : (t.mode === 'HYBRID' ? 'tag-mode-hybrid' : 'tag-mode-social');
        const modeLabel = t.mode === 'CORPORATE' ? 'Corporate' : (t.mode === 'HYBRID' ? 'Hybrid' : 'Friends');
        const membersList = (t.members || []).map(mid => state.users.find(u => u.id === mid) || { id: mid, name: mid, avatar: 'https://api.dicebear.com/7.x/notionists/svg?seed=' + mid });

        return `
          <div class="card-cream rounded-3xl p-5 border border-cream-300 opacity-95 hover:opacity-100 hover:border-amber-400 hover:shadow-lg transition-all duration-200 flex flex-col justify-between group">
            <div>
              <div class="flex items-center justify-between gap-2 mb-3">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold ${tagClass}">
                  <span class="w-1.5 h-1.5 rounded-full ${t.mode === 'CORPORATE' ? 'bg-roseaccent-600' : (t.mode === 'HYBRID' ? 'bg-amber-600' : 'bg-emerald-600')}"></span>
                  ${modeLabel}
                </span>
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  <i data-lucide="lock" class="w-3 h-3 text-amber-700"></i>
                  CONCLUDED
                </span>
              </div>

              <h3 class="text-lg font-bold text-stone-900 group-hover:text-amber-900 transition line-clamp-1">${escapeHtml(t.title)}</h3>
              <p class="text-xs text-stone-500 mt-1 flex items-center gap-1">
                <i data-lucide="map-pin" class="w-3.5 h-3.5 text-stone-400"></i>
                <span>${t.destination ? escapeHtml(t.destination) : 'Archived'}</span>
              </p>

              <div class="mt-4 p-3 rounded-2xl bg-amber-50/60 border border-amber-200 flex items-center justify-between">
                <span class="text-xs text-amber-900 font-medium">Final Settled Spend:</span>
                <span class="text-sm font-extrabold text-amber-900">₹${spent.toLocaleString()}</span>
              </div>

              <!-- Members Stack -->
              <div class="mt-4 flex items-center justify-between">
                <div class="flex items-center -space-x-2">
                  ${membersList.slice(0, 4).map(m => `
                    <img src="${m.avatar}" alt="${escapeHtml(m.name)}" title="${escapeHtml(m.name)}" class="w-7 h-7 rounded-full border-2 border-white bg-cream-200 shadow-xs object-cover" />
                  `).join('')}
                  ${membersList.length > 4 ? `
                    <div class="w-7 h-7 rounded-full border-2 border-white bg-cream-300 text-stone-700 text-[10px] font-bold flex items-center justify-center shadow-xs">
                      +${membersList.length - 4}
                    </div>
                  ` : ''}
                </div>
                <span class="text-xs font-semibold text-stone-500">${membersList.length} members</span>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="mt-5 pt-4 border-t border-cream-200/80 flex items-center gap-2">
              <button onclick="window.selectTrip('${t.id}')" class="flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-cream-300 text-stone-800 hover:bg-cream-100 transition shadow-sm flex items-center justify-center gap-1.5">
                <i data-lucide="file-text" class="w-3.5 h-3.5 text-stone-600"></i>
                <span>View Summary</span>
              </button>
              <button onclick="window.handleToggleEndTrip('${t.id}')" class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 transition shadow-sm flex items-center gap-1">
                <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                <span>Reopen</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  if (window.lucide) lucide.createIcons();
}

window.promptEndTrip = async function(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  state.currentTrip = trip;
  document.getElementById('endTripModalTitle').textContent = trip.title;
  let total = 0;
  try {
    const balances = await api(`/trips/${tripId}/balances`);
    if (balances && balances.totalTripSpent) total = balances.totalTripSpent;
  } catch (e) {
    // fallback
  }
  const sym = trip.currencySymbol || '₹';
  document.getElementById('endTripModalTotalSpend').textContent = `${sym}${total.toLocaleString()}`;
  document.getElementById('endTripModalMembersCount').textContent = `${(trip.members || []).length} members`;
  openModal('modalEndTripSummary');
};

window.renderHomeView = renderHomeView;

async function selectTrip(tripId) {
  if (tripId === '__home__') {
    await renderHomeView();
    return;
  }

  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;

  state.currentTrip = trip;
  const homeView = document.getElementById('homeView');
  if (homeView) homeView.classList.add('hidden');
  document.getElementById('noTripsContainer').classList.add('hidden');
  document.getElementById('activeTripDashboard').classList.remove('hidden');

  renderTripSelector();

  try {
    const [expenses, balances] = await Promise.all([
      api(`/trips/${tripId}/expenses`),
      api(`/trips/${tripId}/balances`)
    ]);

    state.expenses = expenses || [];
    state.balances = balances || null;

    renderAll();
  } catch (err) {
    showToast('Failed to load trip details', 'error');
    console.error(err);
  }
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
  // Trip selector change
  document.getElementById('tripSelector').addEventListener('change', (e) => {
    selectTrip(e.target.value);
  });

  // Home View navigation listeners
  const navLogoBtn = document.getElementById('navLogoBtn');
  if (navLogoBtn) navLogoBtn.addEventListener('click', () => renderHomeView());

  const navHomeBtn = document.getElementById('navHomeBtn');
  if (navHomeBtn) navHomeBtn.addEventListener('click', () => renderHomeView());

  const btnBackToHome = document.getElementById('btnBackToHome');
  if (btnBackToHome) btnBackToHome.addEventListener('click', () => renderHomeView());

  const btnHomeCreateTrip = document.getElementById('btnHomeCreateTrip');
  if (btnHomeCreateTrip) btnHomeCreateTrip.addEventListener('click', () => openModal('modalNewTrip'));

  const btnHomeGoAdmin = document.getElementById('btnHomeGoAdmin');
  if (btnHomeGoAdmin) {
    btnHomeGoAdmin.addEventListener('click', async () => {
      if (state.trips.length > 0) {
        await selectTrip(state.trips[0].id);
        switchTab('admin');
      } else {
        showToast('Please create a trip first to access administration and policies.', 'info');
      }
    });
  }

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  // Category filter pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => {
        p.classList.remove('bg-roseaccent-100', 'text-roseaccent-800', 'border-roseaccent-200');
        p.classList.add('bg-cream-50', 'text-stone-600');
      });
      pill.classList.remove('bg-cream-50', 'text-stone-600');
      pill.classList.add('bg-roseaccent-100', 'text-roseaccent-800', 'border-roseaccent-200');

      state.categoryFilter = pill.dataset.cat;
      renderExpensesList();
    });
  });

  // Modal Triggers
  document.getElementById('btnAddExpenseModal').addEventListener('click', openAddExpenseModal);
  document.getElementById('btnNewTripModal').addEventListener('click', () => openModal('modalNewTrip'));
  const emptyNewTripBtn = document.getElementById('btnEmptyStateNewTrip');
  if (emptyNewTripBtn) emptyNewTripBtn.addEventListener('click', () => openModal('modalNewTrip'));
  document.getElementById('btnOpenSettleModal').addEventListener('click', () => openSettleModal());
  document.getElementById('btnOpenAddMemberModal').addEventListener('click', () => openModal('modalAddMember'));

  // Close Modals
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('.modal-backdrop').classList.add('hidden');
    });
  });

  // Forms
  document.getElementById('formAddExpense').addEventListener('submit', handleAddExpense);
  document.getElementById('formNewTrip').addEventListener('submit', handleNewTrip);
  document.getElementById('formSettlePayment').addEventListener('submit', handleSettlePayment);
  document.getElementById('formAddMember').addEventListener('submit', handleAddMember);

  const editUserForm = document.getElementById('formEditUser');
  if (editUserForm) editUserForm.addEventListener('submit', handleEditUser);

  const adminSettingsForm = document.getElementById('formAdminSettings');
  if (adminSettingsForm) adminSettingsForm.addEventListener('submit', handleAdminSettingsSave);

  // Dynamic split preview on input change
  document.getElementById('expAmount').addEventListener('input', updateSplitPreview);
  
  // Trip mode radio toggle in New Trip modal
  document.querySelectorAll('input[name="tripModeOption"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const corpSettings = document.getElementById('corporateTripSettings');
      if (e.target.value === 'CORPORATE' || e.target.value === 'HYBRID') {
        corpSettings.classList.remove('hidden');
      } else {
        corpSettings.classList.add('hidden');
      }
    });
  });

  // Export CSV
  document.getElementById('btnExportCsv').addEventListener('click', () => {
    if (!state.currentTrip) return;
    const trip = state.currentTrip;
    let csv = `Date,Expense ID,Title,Category,Amount (${trip.currency}),Paid By,Splits,Policy Flags,Location,Receipt\n`;
    state.expenses.forEach(e => {
      const payer = state.users.find(u => u.id === e.paidBy);
      const payerName = payer ? payer.name : e.paidBy;
      const splitsStr = (e.splits || []).map(s => {
        const u = state.users.find(user => user.id === s.userId);
        return `${u ? u.name : s.userId}:${s.amount}`;
      }).join('; ');
      const flagsStr = (e.policyFlags || []).map(f => f.code).join('; ');
      const locStr = e.location ? `${e.location.name || ''} (${e.location.lat},${e.location.lng})` : 'None';
      csv += `"${e.date}","${e.id}","${(e.title || '').replace(/"/g, '""')}","${e.category}",${e.amount},"${payerName}","${splitsStr}","${flagsStr}","${locStr}","${e.receipt || 'None'}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trip.title.replace(/[^a-zA-Z0-9]/g, '_')}_expenses.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported expense report as CSV!', 'info');
  });

  // Corporate Approvals
  document.getElementById('btnApproveTrip').addEventListener('click', () => handleApprovalAction('APPROVE'));
  document.getElementById('btnRejectTrip').addEventListener('click', () => handleApprovalAction('REJECT'));

  // End Trip Toggles & Confirmation
  const btnEndTrip = document.getElementById('btnEndTripToggle');
  if (btnEndTrip) {
    btnEndTrip.addEventListener('click', () => {
      if (!state.currentTrip) return;
      if (state.currentTrip.status === 'ENDED') {
        handleToggleEndTrip(state.currentTrip.id);
      } else {
        // Open confirmation modal
        document.getElementById('endTripModalTitle').textContent = state.currentTrip.title;
        const total = state.balances ? state.balances.totalTripSpent : 0;
        const sym = state.currentTrip.currencySymbol || '₹';
        document.getElementById('endTripModalTotalSpend').textContent = `${sym}${total.toLocaleString()}`;
        document.getElementById('endTripModalMembersCount').textContent = `${(state.currentTrip.members || []).length} members`;
        openModal('modalEndTripSummary');
      }
    });
  }

  const btnConfirmEnd = document.getElementById('btnConfirmEndTrip');
  if (btnConfirmEnd) {
    btnConfirmEnd.addEventListener('click', async () => {
      document.getElementById('modalEndTripSummary').classList.add('hidden');
      if (state.currentTrip) {
        await handleToggleEndTrip(state.currentTrip.id);
      }
    });
  }

  const btnBannerReopen = document.getElementById('btnBannerReopenTrip');
  if (btnBannerReopen) {
    btnBannerReopen.addEventListener('click', () => {
      if (state.currentTrip) handleToggleEndTrip(state.currentTrip.id);
    });
  }

  // Live Location Capture
  const btnCaptureLoc = document.getElementById('btnCaptureLocation');
  if (btnCaptureLoc) {
    btnCaptureLoc.addEventListener('click', captureLiveLocation);
  }

  const btnRemoveLoc = document.getElementById('btnRemoveLocation');
  if (btnRemoveLoc) {
    btnRemoveLoc.addEventListener('click', () => {
      state.pendingLocation = null;
      document.getElementById('expenseLocationBadge').classList.add('hidden');
      document.getElementById('lblCaptureLocation').textContent = 'Capture Location';
      document.getElementById('expLocationName').value = '';
    });
  }

  // Receipt File Upload Dropzone
  const dropzone = document.getElementById('receiptDropzone');
  const fileInput = document.getElementById('expReceiptFileInput');
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-roseaccent-500', 'bg-roseaccent-50');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-roseaccent-500', 'bg-roseaccent-50');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-roseaccent-500', 'bg-roseaccent-50');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleReceiptFileSelected(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleReceiptFileSelected(e.target.files[0]);
      }
    });
  }

  const btnRemoveReceipt = document.getElementById('btnRemoveUploadedReceipt');
  if (btnRemoveReceipt) {
    btnRemoveReceipt.addEventListener('click', removeUploadedReceipt);
  }

  const btnPreviewReceipt = document.getElementById('btnPreviewUploadedReceipt');
  if (btnPreviewReceipt) {
    btnPreviewReceipt.addEventListener('click', () => {
      if (state.pendingReceiptData) {
        showReceiptLightbox({
          title: 'Attached Receipt Preview',
          subtitle: state.pendingReceiptData.name,
          dataUrl: state.pendingReceiptData.dataUrl,
          name: state.pendingReceiptData.name,
          type: state.pendingReceiptData.type
        });
      }
    });
  }

  // Admin Actions
  const btnAdminAddUser = document.getElementById('btnAdminAddUserModal');
  if (btnAdminAddUser) {
    btnAdminAddUser.addEventListener('click', () => openModal('modalAddMember'));
  }

  const btnExportBackup = document.getElementById('btnAdminExportBackup');
  if (btnExportBackup) {
    btnExportBackup.addEventListener('click', handleAdminExportBackup);
  }

  const restoreInput = document.getElementById('adminRestoreFileInput');
  if (restoreInput) {
    restoreInput.addEventListener('change', handleAdminRestoreBackup);
  }

  const btnCleanReset = document.getElementById('btnAdminCleanReset');
  if (btnCleanReset) {
    btnCleanReset.addEventListener('click', handleAdminCleanReset);
  }

  // All Expenses Scope toggle
  const scopeCurrentBtn = document.getElementById('scopeCurrentTripBtn');
  const scopeAllBtn = document.getElementById('scopeAllTripsBtn');
  if (scopeCurrentBtn && scopeAllBtn) {
    scopeCurrentBtn.addEventListener('click', () => {
      state.allExpensesScope = 'CURRENT';
      scopeCurrentBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-stone-800 shadow-sm transition';
      scopeAllBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-500 hover:text-stone-800 transition';
      renderAllExpensesTab();
    });
    scopeAllBtn.addEventListener('click', async () => {
      state.allExpensesScope = 'ALL_TRIPS';
      scopeAllBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-stone-800 shadow-sm transition';
      scopeCurrentBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-500 hover:text-stone-800 transition';
      try {
        state.allTripsExpenses = await api('/expenses');
      } catch (err) {
        console.error(err);
      }
      renderAllExpensesTab();
    });
  }

  // All Expenses Search input
  const searchInput = document.getElementById('allExpensesSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.allExpensesSearch = e.target.value.toLowerCase().trim();
      renderAllExpensesTab();
    });
  }

  // Print button
  const printBtn = document.getElementById('btnPrintReport');
  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }
}

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.dataset.tab === tabId) {
      b.classList.add('active', 'bg-white', 'text-stone-900', 'shadow-sm');
      b.classList.remove('text-stone-600');
    } else {
      b.classList.remove('active', 'bg-white', 'text-stone-900', 'shadow-sm');
      b.classList.add('text-stone-600');
    }
  });

  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hidden');
  });

  const activeContent = document.getElementById(`tab-${tabId}`);
  if (activeContent) activeContent.classList.remove('hidden');

  if (tabId === 'all-expenses') {
    renderAllExpensesTab();
  } else if (tabId === 'admin') {
    renderAdminTab();
  } else if (tabId === 'members') {
    renderMembersTab();
  }

  if (window.lucide) lucide.createIcons();
}

// ==================== RENDERING LOGIC ====================

function renderAll() {
  if (!state.currentTrip) {
    renderEmptyState();
    return;
  }
  renderTripHeader();
  renderTopStats();
  renderExpensesList();
  renderBalancesTab();
  renderCorporateTab();
  renderMembersTab();
  renderAllExpensesTab();
  if (state.activeTab === 'admin') renderAdminTab();
  if (window.lucide) lucide.createIcons();
}

function renderTripSelector() {
  const sel = document.getElementById('tripSelector');
  if (!sel) return;
  const isHome = !state.currentTrip;
  sel.innerHTML = [
    `<option value="__home__" ${isHome ? 'selected' : ''}>🏠 Home — All Trips Overview</option>`,
    ...state.trips.map(t => `
      <option value="${t.id}" ${state.currentTrip && state.currentTrip.id === t.id ? 'selected' : ''}>
        ${t.status === 'ENDED' ? '🔒 [CLOSED] ' : '🟢 '}${t.title} (${t.mode})
      </option>
    `)
  ].join('');
}

function renderTripHeader() {
  const trip = state.currentTrip;
  document.getElementById('tripTitle').textContent = trip.title;
  document.getElementById('tripDescription').textContent = trip.description || `${trip.destination} • ${trip.currency}`;

  // Mode badge
  const modeBadge = document.getElementById('currentTripModeBadge');
  const tagClass = trip.mode === 'CORPORATE' ? 'tag-mode-corporate' : trip.mode === 'HYBRID' ? 'tag-mode-hybrid' : 'tag-mode-social';
  modeBadge.className = `hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold ${tagClass}`;
  modeBadge.innerHTML = `
    <span class="w-1.5 h-1.5 rounded-full ${trip.mode === 'CORPORATE' ? 'bg-roseaccent-600' : trip.mode === 'HYBRID' ? 'bg-amber-600' : 'bg-emerald-600'}"></span>
    ${trip.mode === 'CORPORATE' ? 'Corporate Travel' : trip.mode === 'HYBRID' ? 'Team Offsite' : 'Friends Trip'}
  `;

  // Status pill
  const statusPill = document.getElementById('tripStatusPill');
  const isCorporate = trip.mode === 'CORPORATE' || trip.mode === 'HYBRID';
  
  if (trip.status === 'ENDED') {
    statusPill.textContent = 'ENDED / CLOSED';
    statusPill.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-300';
  } else if (isCorporate && trip.corporateConfig) {
    statusPill.textContent = trip.corporateConfig.approvalStatus;
    statusPill.className = `text-xs px-2.5 py-0.5 rounded-full font-bold ${
      trip.corporateConfig.approvalStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
      trip.corporateConfig.approvalStatus === 'REJECTED' ? 'bg-roseaccent-100 text-roseaccent-800 border border-roseaccent-300' :
      'bg-amber-100 text-amber-800 border border-amber-300'
    }`;
  } else {
    statusPill.textContent = trip.status;
    statusPill.className = 'text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200';
  }

  // End Trip Toggle button styling
  const endBtnText = document.getElementById('btnEndTripToggleText');
  const endIcon = document.getElementById('endTripIcon');
  const endedBanner = document.getElementById('tripEndedBanner');

  if (trip.status === 'ENDED') {
    if (endBtnText) endBtnText.textContent = 'Reopen Trip';
    if (endIcon) endIcon.setAttribute('data-lucide', 'unlock');
    if (endedBanner) endedBanner.classList.remove('hidden');
  } else {
    if (endBtnText) endBtnText.textContent = 'End Trip';
    if (endIcon) endIcon.setAttribute('data-lucide', 'lock');
    if (endedBanner) endedBanner.classList.add('hidden');
  }

  // Hide or show Corporate tab button
  const corpTabBtn = document.getElementById('tabCorporateBtn');
  if (isCorporate) {
    corpTabBtn.classList.remove('hidden');
  } else {
    corpTabBtn.classList.add('hidden');
    if (state.activeTab === 'corporate') switchTab('expenses');
  }
}

function renderTopStats() {
  const trip = state.currentTrip;
  const sym = trip.currencySymbol || '₹';
  const total = state.balances ? state.balances.totalTripSpent : 0;
  
  // Card 1: Total Spend & Budget
  document.getElementById('cardTotalSpend').textContent = `${sym}${total.toLocaleString()}`;
  const budget = trip.budget || 0;
  let pct = 0;
  if (budget > 0) {
    pct = Math.min(100, Math.round((total / budget) * 100));
    document.getElementById('budgetPercentLabel').textContent = `${pct}% of ${sym}${budget.toLocaleString()}`;
  } else {
    document.getElementById('budgetPercentLabel').textContent = 'No budget cap';
  }
  document.getElementById('budgetProgressBar').style.width = `${pct}%`;
  if (pct >= 90) {
    document.getElementById('budgetProgressBar').className = 'bg-roseaccent-600 h-full rounded-full transition-all duration-500';
  } else {
    document.getElementById('budgetProgressBar').className = 'bg-emerald-500 h-full rounded-full transition-all duration-500';
  }

  // Card 2: User Balance
  let userNet = 0;
  if (state.balances && state.balances.membersSummary) {
    const summaryItem = state.balances.membersSummary.find(m => m.userId === state.currentUser);
    if (summaryItem) userNet = summaryItem.netBalance;
  }
  
  const balanceEl = document.getElementById('cardUserBalance');
  const subtextEl = document.getElementById('cardBalanceSubtext');

  if (userNet > 0.01) {
    balanceEl.textContent = `+${sym}${userNet.toLocaleString()}`;
    balanceEl.className = 'text-2xl sm:text-3xl font-bold text-emerald-700';
    subtextEl.innerHTML = `<i data-lucide="arrow-down-left" class="w-3.5 h-3.5 text-emerald-600"></i> <span class="text-emerald-700">You are owed money</span>`;
  } else if (userNet < -0.01) {
    balanceEl.textContent = `-${sym}${Math.abs(userNet).toLocaleString()}`;
    balanceEl.className = 'text-2xl sm:text-3xl font-bold text-roseaccent-800';
    subtextEl.innerHTML = `<i data-lucide="arrow-up-right" class="w-3.5 h-3.5 text-roseaccent-600"></i> <span class="text-roseaccent-700">You owe other members</span>`;
  } else {
    balanceEl.textContent = `${sym}0.00`;
    balanceEl.className = 'text-2xl sm:text-3xl font-bold text-stone-700';
    subtextEl.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-stone-500"></i> <span class="text-stone-500">You are settled up</span>`;
  }

  // Card 3: Participants
  const memberCount = (trip.members || []).length;
  document.getElementById('cardMemberCount').textContent = memberCount;
  const avatarStack = document.getElementById('cardAvatarStack');
  avatarStack.innerHTML = (trip.members || []).slice(0, 5).map(mId => {
    const u = state.users.find(user => user.id === mId) || { name: mId, avatar: '' };
    return `
      <img src="${u.avatar || 'https://api.dicebear.com/7.x/notionists/svg?seed=' + mId}" 
           alt="${u.name}" 
           title="${u.name}" 
           class="w-7 h-7 rounded-full border-2 border-white bg-cream-200">
    `;
  }).join('');

  // Card 4: Policy Title
  const isCorporate = trip.mode === 'CORPORATE' || trip.mode === 'HYBRID';
  document.getElementById('cardPolicyTitle').textContent = isCorporate ? 'Corporate Audit Guard' : 'Friends Outing Guard';
  document.getElementById('cardPolicyDesc').textContent = isCorporate 
    ? `Per-diem cap of ${sym}${(trip.corporateConfig && trip.corporateConfig.perDiemLimit) || 3000} & mandatory receipts enabled.`
    : 'Greedy min-cost debt simplification enabled.';

  // Badges in tabs
  document.getElementById('badgeExpenseCount').textContent = state.expenses.length;
  const transfersCount = (state.balances && state.balances.simplifiedTransfers) ? state.balances.simplifiedTransfers.length : 0;
  document.getElementById('badgeTransfersCount').textContent = transfersCount;
}

function renderExpensesList() {
  const container = document.getElementById('expensesList');
  const sym = state.currentTrip ? state.currentTrip.currencySymbol : '₹';

  let list = state.expenses;
  if (state.categoryFilter !== 'ALL') {
    list = list.filter(e => e.category === state.categoryFilter);
  }

  document.getElementById('filteredExpenseCount').textContent = list.length;

  if (list.length === 0) {
    container.innerHTML = `
      <div class="bg-white p-12 text-center rounded-2xl border border-cream-300">
        <div class="w-12 h-12 mx-auto rounded-full bg-roseaccent-100 text-roseaccent-600 flex items-center justify-center mb-3">
          <i data-lucide="receipt" class="w-6 h-6"></i>
        </div>
        <h4 class="text-base font-bold text-stone-800">No expenses recorded yet</h4>
        <p class="text-xs text-stone-500 mt-1 max-w-sm mx-auto">Click 'Add Expense' to record your first meal, stay, or cab ride for this trip.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = list.map(exp => {
    const payer = state.users.find(u => u.id === exp.paidBy) || { name: exp.paidBy, avatar: '' };
    const categoryIcons = {
      FOOD: { icon: 'utensils', bg: 'bg-orange-100 text-orange-700' },
      STAY: { icon: 'home', bg: 'bg-roseaccent-100 text-roseaccent-700' },
      TRAVEL: { icon: 'plane', bg: 'bg-blue-100 text-blue-700' },
      ACTIVITIES: { icon: 'sparkles', bg: 'bg-purple-100 text-purple-700' },
      OTHER: { icon: 'tag', bg: 'bg-stone-100 text-stone-700' }
    };
    const catMeta = categoryIcons[exp.category] || categoryIcons.OTHER;

    // Policy violation warnings
    const violations = exp.policyFlags || [];
    const violationHtml = violations.length > 0 ? `
      <div class="mt-2.5 p-2 rounded-xl bg-roseaccent-50 border border-roseaccent-200 text-roseaccent-900 text-xs flex items-start gap-2">
        <i data-lucide="alert-circle" class="w-4 h-4 text-roseaccent-600 shrink-0 mt-0.5"></i>
        <div>
          ${violations.map(v => `<div class="font-medium">${v.message}</div>`).join('')}
        </div>
      </div>
    ` : '';

    const splitsSummary = (exp.splits || []).map(s => {
      const u = state.users.find(user => user.id === s.userId);
      return `<span class="inline-block px-2 py-0.5 rounded-md bg-cream-100 text-[11px] text-stone-600 font-medium">${u ? u.name.split(' ')[0] : s.userId}: ${sym}${s.amount}</span>`;
    }).join(' ');

    return `
      <div class="card-cream p-4 sm:p-5 rounded-2xl flex flex-col gap-2">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3.5">
            <div class="w-10 h-10 rounded-xl ${catMeta.bg} flex items-center justify-center shrink-0">
              <i data-lucide="${catMeta.icon}" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h4 class="text-base font-bold text-stone-900">${exp.title}</h4>
                <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cream-200 text-stone-600">${exp.category}</span>
                
                ${exp.receipt || exp.receiptData ? `
                  <button type="button" onclick="window.viewReceipt('${exp.id}')" class="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full hover:bg-emerald-100 transition cursor-pointer" title="View attached receipt">
                    <i data-lucide="file-check" class="w-3 h-3 text-emerald-600"></i>
                    <span>Receipt</span>
                    <i data-lucide="external-link" class="w-2.5 h-2.5 text-emerald-500 ml-0.5"></i>
                  </button>
                ` : ''}

                ${exp.location ? `
                  <a href="https://www.google.com/maps?q=${exp.location.lat},${exp.location.lng}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-[10px] font-semibold text-roseaccent-800 bg-roseaccent-50 border border-roseaccent-200 px-2 py-0.5 rounded-full hover:bg-roseaccent-100 transition" title="Open Google Maps Location">
                    <i data-lucide="map-pin" class="w-3 h-3 text-roseaccent-600"></i>
                    <span>${exp.location.name || 'Live GPS'}</span>
                  </a>
                ` : ''}
              </div>
              <p class="text-xs text-stone-500 mt-1">
                Paid by <strong class="text-stone-800 font-semibold">${payer.name}</strong> on ${exp.date}
                ${exp.notes ? `• <span class="italic text-stone-400">"${exp.notes}"</span>` : ''}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="text-right">
              <div class="text-lg font-bold text-stone-900">${sym}${exp.amount.toLocaleString()}</div>
              <div class="text-[11px] text-stone-400 font-medium">${(exp.splits || []).length} participants</div>
            </div>
            <button onclick="handleDeleteExpense('${exp.id}')" title="Delete Expense" class="p-2 text-stone-400 hover:text-roseaccent-600 rounded-lg hover:bg-roseaccent-50 transition">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Participants split breakdown -->
        <div class="pt-2 border-t border-cream-200 flex flex-wrap items-center gap-1.5 mt-1">
          <span class="text-[11px] text-stone-400 font-medium mr-1">Split:</span>
          ${splitsSummary}
        </div>

        ${violationHtml}
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function renderBalancesTab() {
  const container = document.getElementById('settlementsList');
  const historyContainer = document.getElementById('historySettlementsList');
  const membersList = document.getElementById('membersBalanceList');
  const sym = state.currentTrip ? state.currentTrip.currencySymbol : '₹';

  if (!state.balances) return;

  const { simplifiedTransfers, completedSettlements, membersSummary } = state.balances;

  // 1. Simplified transfers (Who pays whom)
  if (simplifiedTransfers.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-stone-500 text-xs">
        <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
          <i data-lucide="check" class="w-5 h-5"></i>
        </div>
        <p class="font-bold text-stone-800 text-sm">All balances are completely settled!</p>
        <p class="mt-0.5">No pending transfers needed between members.</p>
      </div>
    `;
  } else {
    container.innerHTML = simplifiedTransfers.map(tr => `
      <div class="p-4 rounded-xl bg-white border border-cream-300 flex items-center justify-between gap-3 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-roseaccent-50 text-roseaccent-700 flex items-center justify-center font-bold text-xs shrink-0">
            ${tr.fromName[0]}
          </div>
          <div>
            <div class="text-xs text-stone-500">
              <strong class="text-stone-900">${tr.fromName}</strong> pays <strong class="text-stone-900">${tr.toName}</strong>
            </div>
            <div class="text-xs text-stone-400 mt-0.5">
              ${tr.toUpiId ? `UPI: <span class="font-mono text-stone-600">${tr.toUpiId}</span>` : 'No UPI registered'}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <div class="text-right">
            <div class="text-sm font-bold text-roseaccent-800">${sym}${tr.amount}</div>
          </div>

          ${tr.toUpiId ? `
            <a href="${tr.upiPaymentUrl}" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 transition">
              <i data-lucide="send" class="w-3 h-3"></i>
              <span>Pay</span>
            </a>
          ` : ''}

          <button onclick="prefillSettleModal('${tr.fromUser}', '${tr.toUser}', ${tr.amount})" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cream-100 hover:bg-cream-200 text-stone-700 transition" title="Mark as settled">
            <i data-lucide="check" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  // 2. Settlement History
  if (completedSettlements.length === 0) {
    historyContainer.innerHTML = '<div class="text-stone-400 italic py-2">No settlements recorded yet.</div>';
  } else {
    historyContainer.innerHTML = completedSettlements.map(stl => {
      const fromU = state.users.find(u => u.id === stl.fromUser) || { name: stl.fromUser };
      const toU = state.users.find(u => u.id === stl.toUser) || { name: stl.toUser };
      const dt = new Date(stl.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      return `
        <div class="flex items-center justify-between py-2 border-b border-cream-200 last:border-0">
          <div>
            <strong class="text-stone-800">${fromU.name}</strong> paid <strong class="text-stone-800">${toU.name}</strong>
            <span class="text-[10px] text-stone-400 ml-1">(${stl.reference || 'Manual Settle'})</span>
          </div>
          <div class="font-bold text-stone-900">${sym}${stl.amount} <span class="text-[10px] font-normal text-stone-400 ml-1">${dt}</span></div>
        </div>
      `;
    }).join('');
  }

  // 3. Individual member shares & net balances
  membersList.innerHTML = membersSummary.map(m => {
    const isCreditor = m.netBalance > 0.01;
    const isDebtor = m.netBalance < -0.01;
    return `
      <div class="p-3.5 rounded-xl bg-cream-50 border border-cream-200 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <img src="${m.avatar || 'https://api.dicebear.com/7.x/notionists/svg?seed=' + m.userId}" class="w-8 h-8 rounded-full bg-white">
          <div>
            <div class="text-xs font-bold text-stone-900">${m.name}</div>
            <div class="text-[10px] text-stone-400">Paid: ${sym}${m.totalPaid} • Share: ${sym}${m.totalShare}</div>
          </div>
        </div>

        <div class="text-right">
          <div class="text-xs font-bold ${isCreditor ? 'text-emerald-700' : isDebtor ? 'text-roseaccent-700' : 'text-stone-500'}">
            ${isCreditor ? '+' : ''}${sym}${m.netBalance}
          </div>
          <div class="text-[9px] uppercase font-semibold text-stone-400">
            ${isCreditor ? 'Gets back' : isDebtor ? 'Owes' : 'Settled'}
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function renderCorporateTab() {
  const trip = state.currentTrip;
  if (!trip || (trip.mode !== 'CORPORATE' && trip.mode !== 'HYBRID')) return;

  const cfg = trip.corporateConfig || {};
  const sym = trip.currencySymbol || '₹';

  // Populate config summary
  document.getElementById('corpCostCenter').textContent = cfg.costCenter || 'N/A';
  document.getElementById('corpPerDiemLimit').textContent = `${sym}${(cfg.perDiemLimit || 3000).toLocaleString()} / day`;
  document.getElementById('corpReceiptThreshold').textContent = `Expenses ≥ ${sym}${(cfg.receiptRequiredThreshold || 500).toLocaleString()}`;

  // Status Badge
  const badge = document.getElementById('corpApprovalStatusBadge');
  const status = cfg.approvalStatus || 'PENDING';
  badge.textContent = status;
  badge.className = `text-xs px-2.5 py-1 rounded-full font-bold ${
    status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
    status === 'REJECTED' ? 'bg-roseaccent-100 text-roseaccent-800 border border-roseaccent-300' :
    'bg-amber-100 text-amber-800 border border-amber-300'
  }`;

  // Aggregate policy violations across all trip expenses
  const allViolations = [];
  state.expenses.forEach(e => {
    (e.policyFlags || []).forEach(f => {
      allViolations.push({
        expenseTitle: e.title,
        amount: e.amount,
        payer: (state.users.find(u => u.id === e.paidBy) || {}).name || e.paidBy,
        date: e.date,
        ...f
      });
    });
  });

  const violationsContainer = document.getElementById('corpViolationsList');
  const badgeViolations = document.getElementById('badgePolicyViolations');

  if (allViolations.length === 0) {
    badgeViolations.classList.add('hidden');
    violationsContainer.innerHTML = `
      <div class="p-6 text-center text-xs text-stone-500 bg-white rounded-xl border border-cream-200">
        <i data-lucide="shield-check" class="w-8 h-8 text-emerald-600 mx-auto mb-2"></i>
        <p class="font-bold text-stone-800 text-sm">100% Policy Compliant</p>
        <p class="mt-0.5">All corporate travel expenses satisfy per-diem limits and have verified receipt attachments.</p>
      </div>
    `;
  } else {
    badgeViolations.classList.remove('hidden');
    badgeViolations.textContent = allViolations.length;
    violationsContainer.innerHTML = allViolations.map(v => `
      <div class="p-3.5 rounded-xl bg-white border border-roseaccent-200 flex items-start justify-between gap-3 text-xs">
        <div class="flex items-start gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-roseaccent-100 text-roseaccent-700 flex items-center justify-center shrink-0 mt-0.5">
            <i data-lucide="alert-triangle" class="w-4 h-4"></i>
          </div>
          <div>
            <div class="font-bold text-stone-900">${v.expenseTitle} (${sym}${v.amount})</div>
            <div class="text-stone-500 mt-0.5">${v.message}</div>
            <div class="text-[10px] text-stone-400 mt-0.5">Reported by ${v.payer} on ${v.date}</div>
          </div>
        </div>
        <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-roseaccent-100 text-roseaccent-800 uppercase shrink-0">
          ${v.code}
        </span>
      </div>
    `).join('');
  }

  if (window.lucide) lucide.createIcons();
}

function renderMembersTab() {
  const trip = state.currentTrip;
  if (!trip) return;
  const sym = trip.currencySymbol || '₹';
  const grid = document.getElementById('membersGrid');
  const summary = state.balances ? state.balances.membersSummary : [];

  grid.innerHTML = (trip.members || []).map(mId => {
    const user = state.users.find(u => u.id === mId) || { id: mId, name: mId, email: '', phone: '', upiId: '' };
    const memberStats = summary.find(s => s.userId === mId) || { totalPaid: 0, totalShare: 0, netBalance: 0 };
    const cleanPhone = user.phone ? user.phone.replace(/[^0-9]/g, '') : '';

    return `
      <div class="p-4 rounded-2xl bg-white border border-cream-300 flex flex-col justify-between shadow-sm">
        <div>
          <div class="flex items-center gap-3 mb-3">
            <img src="${user.avatar || 'https://api.dicebear.com/7.x/notionists/svg?seed=' + user.id}" class="w-11 h-11 rounded-full bg-cream-100 shrink-0" alt="${user.name}">
            <div class="overflow-hidden">
              <div class="text-sm font-bold text-stone-900 truncate">${user.name}</div>
              <div class="text-xs text-stone-400 truncate">${user.email || 'No email registered'}</div>
              <div class="text-[11px] text-stone-500 font-medium">${user.phone ? '📞 ' + user.phone : 'No phone registered'}</div>
            </div>
          </div>

          <div class="pt-2.5 border-t border-cream-200 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span class="text-stone-400 text-[10px] uppercase font-semibold">Total Paid</span>
              <div class="font-bold text-stone-800">${sym}${memberStats.totalPaid}</div>
            </div>
            <div>
              <span class="text-stone-400 text-[10px] uppercase font-semibold">Fair Share</span>
              <div class="font-bold text-stone-800">${sym}${memberStats.totalShare}</div>
            </div>
          </div>
        </div>

        <!-- 1-Click WhatsApp, Call & Copy UPI shortcuts -->
        <div class="mt-3.5 pt-3 border-t border-cream-200 flex items-center gap-1.5 flex-wrap">
          ${cleanPhone ? `
            <a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener" class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1 transition" title="Chat on WhatsApp">
              <i data-lucide="message-circle" class="w-3 h-3 text-emerald-600"></i>
              <span>WhatsApp</span>
            </a>
            <a href="tel:${cleanPhone}" class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-cream-100 text-stone-700 hover:bg-cream-200 flex items-center gap-1 transition" title="Call directly">
              <i data-lucide="phone" class="w-3 h-3 text-stone-600"></i>
              <span>Call</span>
            </a>
          ` : ''}

          ${user.upiId ? `
            <button onclick="window.copyToClipboard('${user.upiId}', 'UPI ID')" class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-roseaccent-50 text-roseaccent-800 border border-roseaccent-200 hover:bg-roseaccent-100 flex items-center gap-1 transition" title="Copy UPI address">
              <i data-lucide="copy" class="w-3 h-3 text-roseaccent-600"></i>
              <span>Copy UPI</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function renderAllExpensesTab() {
  const trip = state.currentTrip;
  if (!trip && state.allExpensesScope === 'CURRENT') return;

  const sym = trip ? (trip.currencySymbol || '₹') : '₹';
  let list = state.allExpensesScope === 'ALL_TRIPS' ? state.allTripsExpenses : state.expenses;

  // Filter by search query if any
  if (state.allExpensesSearch) {
    list = list.filter(e => {
      const payer = state.users.find(u => u.id === e.paidBy);
      const payerName = payer ? payer.name.toLowerCase() : '';
      return e.title.toLowerCase().includes(state.allExpensesSearch) ||
             e.category.toLowerCase().includes(state.allExpensesSearch) ||
             payerName.includes(state.allExpensesSearch) ||
             (e.notes && e.notes.toLowerCase().includes(state.allExpensesSearch));
    });
  }

  // Sort chronological for running total
  const sortedList = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Compute metrics
  const totalAmount = sortedList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const count = sortedList.length;
  const avgExpense = count > 0 ? Math.round((totalAmount / count) * 100) / 100 : 0;

  // Category breakdown
  const catTotals = {};
  sortedList.forEach(e => {
    catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount);
  });
  let topCat = '-';
  let topCatAmt = 0;
  Object.entries(catTotals).forEach(([cat, amt]) => {
    if (amt > topCatAmt) {
      topCatAmt = amt;
      topCat = cat;
    }
  });

  const memberCount = (trip && trip.members) ? trip.members.length : 1;
  const perPersonShare = memberCount > 0 ? Math.round((totalAmount / memberCount) * 100) / 100 : 0;

  // Populate cards
  const elGrandTotal = document.getElementById('auditGrandTotal');
  if (elGrandTotal) elGrandTotal.textContent = `${sym}${totalAmount.toLocaleString()}`;
  const elItemsCount = document.getElementById('auditItemsCount');
  if (elItemsCount) elItemsCount.textContent = `${count} transactions logged`;
  const elAvgExpense = document.getElementById('auditAvgExpense');
  if (elAvgExpense) elAvgExpense.textContent = `${sym}${avgExpense.toLocaleString()}`;
  const elTopCat = document.getElementById('auditTopCategory');
  if (elTopCat) elTopCat.textContent = topCat;
  const elTopCatAmt = document.getElementById('auditTopCategoryAmount');
  if (elTopCatAmt) elTopCatAmt.textContent = `${sym}${topCatAmt.toLocaleString()} spent`;
  const elPerPerson = document.getElementById('auditPerPersonShare');
  if (elPerPerson) elPerPerson.textContent = `${sym}${perPersonShare.toLocaleString()}`;
  const elMembersActive = document.getElementById('auditMembersActive');
  if (elMembersActive) elMembersActive.textContent = `Across ${memberCount} members`;
  const elTableTotal = document.getElementById('tableGrandTotalAmount');
  if (elTableTotal) elTableTotal.textContent = `${sym}${totalAmount.toLocaleString()}`;
  const elBadgeTotal = document.getElementById('badgeAllExpensesTotal');
  if (elBadgeTotal) elBadgeTotal.textContent = `${sym}${totalAmount.toLocaleString()}`;

  // Category spend bar & pills
  const catColors = {
    FOOD: { bar: 'bg-orange-400', pill: 'bg-orange-100 text-orange-800' },
    STAY: { bar: 'bg-roseaccent-600', pill: 'bg-roseaccent-100 text-roseaccent-800' },
    TRAVEL: { bar: 'bg-blue-400', pill: 'bg-blue-100 text-blue-800' },
    ACTIVITIES: { bar: 'bg-purple-400', pill: 'bg-purple-100 text-purple-800' },
    OTHER: { bar: 'bg-stone-400', pill: 'bg-stone-100 text-stone-800' }
  };

  const barContainer = document.getElementById('auditCategoryBar');
  const pillsContainer = document.getElementById('auditCategoryPills');
  
  if (barContainer && pillsContainer) {
    if (totalAmount > 0) {
      barContainer.innerHTML = Object.entries(catTotals).map(([cat, amt]) => {
        const pct = Math.max(3, Math.round((amt / totalAmount) * 100));
        const c = catColors[cat] || catColors.OTHER;
        return `<div class="${c.bar} h-full" style="width: ${pct}%" title="${cat}: ${pct}% (${sym}${amt})"></div>`;
      }).join('');

      pillsContainer.innerHTML = Object.entries(catTotals).map(([cat, amt]) => {
        const pct = Math.round((amt / totalAmount) * 100);
        const c = catColors[cat] || catColors.OTHER;
        return `<span class="px-2 py-0.5 rounded-md font-semibold ${c.pill}">${cat} ${pct}%</span>`;
      }).join(' ');
    } else {
      barContainer.innerHTML = `<div class="bg-cream-300 w-full h-full"></div>`;
      pillsContainer.innerHTML = `<span class="text-stone-400 italic">No expenses</span>`;
    }
  }

  // Populate Table Body
  const tbody = document.getElementById('allExpensesTableBody');
  if (tbody) {
    if (sortedList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-10 text-stone-400 italic">
            No expenses recorded matching the current filter.
          </td>
        </tr>
      `;
    } else {
      let runningTotal = 0;
      tbody.innerHTML = sortedList.map((e, idx) => {
        runningTotal += Number(e.amount) || 0;
        const payer = state.users.find(u => u.id === e.paidBy) || { name: e.paidBy };
        const tripObj = state.trips.find(t => t.id === e.tripId);
        
        const splitChips = (e.splits || []).map(s => {
          const u = state.users.find(user => user.id === s.userId);
          const uName = u ? u.name.split(' ')[0] : s.userId;
          return `<span class="inline-block px-1.5 py-0.5 rounded bg-cream-100 text-[10px] text-stone-600 font-medium">${uName}: ${sym}${s.amount}</span>`;
        }).join(' ');

        return `
          <tr class="hover:bg-cream-50/70 transition">
            <td class="py-3 px-3.5 font-mono text-[11px] text-stone-400 font-semibold">${idx + 1}</td>
            <td class="py-3 px-3.5 whitespace-nowrap text-stone-600 font-medium">${e.date}</td>
            <td class="py-3 px-3.5">
              <div class="font-bold text-stone-900">${e.title}</div>
              <div class="text-[10px] text-stone-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                ${tripObj ? `<span class="font-semibold text-roseaccent-700">${tripObj.title}</span> • ` : ''}
                ${e.location ? `<a href="https://www.google.com/maps?q=${e.location.lat},${e.location.lng}" target="_blank" rel="noopener" class="text-roseaccent-700 hover:underline inline-flex items-center gap-0.5"><i data-lucide="map-pin" class="w-2.5 h-2.5"></i> ${e.location.name || 'GPS'}</a> • ` : ''}
                ${e.notes ? `<span>"${e.notes}"</span> • ` : ''}
                ${e.receipt || e.receiptData ? `<button type="button" onclick="window.viewReceipt('${e.id}')" class="text-emerald-700 hover:underline font-semibold inline-flex items-center gap-0.5 cursor-pointer">📎 View Receipt</button>` : '<span class="text-stone-300">No Receipt</span>'}
              </div>
            </td>
            <td class="py-3 px-3.5 whitespace-nowrap">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cream-200 text-stone-700">
                ${e.category}
              </span>
            </td>
            <td class="py-3 px-3.5 whitespace-nowrap font-medium text-stone-800">${payer.name}</td>
            <td class="py-3 px-3.5">
              <div class="flex flex-wrap items-center gap-1 max-w-xs">
                ${splitChips}
              </div>
            </td>
            <td class="py-3 px-3.5 text-right font-bold text-stone-900 whitespace-nowrap">${sym}${e.amount.toLocaleString()}</td>
            <td class="py-3 px-3.5 text-right font-mono font-semibold text-roseaccent-800 whitespace-nowrap">${sym}${runningTotal.toLocaleString()}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // End-of-Trip Member Settlement Reconciliation Grid
  const membersGrid = document.getElementById('allExpensesMemberSummaryGrid');
  if (membersGrid) {
    const summary = (state.balances && state.balances.membersSummary) ? state.balances.membersSummary : [];
    if (summary.length === 0) {
      membersGrid.innerHTML = `<div class="col-span-4 text-center py-4 text-stone-400 text-xs italic">No member financial data recorded yet.</div>`;
    } else {
      membersGrid.innerHTML = summary.map(m => {
        const isCreditor = m.netBalance > 0.01;
        const isDebtor = m.netBalance < -0.01;
        return `
          <div class="p-3.5 rounded-xl bg-white border border-cream-200 shadow-sm flex flex-col justify-between">
            <div class="flex items-center justify-between mb-2">
              <div class="font-bold text-xs text-stone-900">${m.name}</div>
              <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                isCreditor ? 'bg-emerald-100 text-emerald-800' : isDebtor ? 'bg-roseaccent-100 text-roseaccent-800' : 'bg-cream-200 text-stone-600'
              }">
                ${isCreditor ? 'Gets Back' : isDebtor ? 'Owes' : 'Settled'}
              </span>
            </div>

            <div class="space-y-1 text-[11px] text-stone-500">
              <div class="flex justify-between">
                <span>Total Paid:</span>
                <span class="font-semibold text-stone-800">${sym}${m.totalPaid.toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span>Fair Share:</span>
                <span class="font-semibold text-stone-800">${sym}${m.totalShare.toLocaleString()}</span>
              </div>
            </div>

            <div class="mt-2.5 pt-2 border-t border-cream-100 flex items-center justify-between">
              <span class="text-[10px] text-stone-400 uppercase font-bold">Net Position</span>
              <span class="font-extrabold text-xs ${isCreditor ? 'text-emerald-700' : isDebtor ? 'text-roseaccent-700' : 'text-stone-700'}">
                ${isCreditor ? '+' : ''}${sym}${m.netBalance.toLocaleString()}
              </span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  if (window.lucide) lucide.createIcons();
}

// ==================== ADMIN PANEL RENDERING ====================

async function renderAdminTab() {
  try {
    const [stats, auditLogs, settings] = await Promise.all([
      api('/admin/stats'),
      api('/admin/audit-logs'),
      api('/admin/settings')
    ]);

    state.adminStats = stats;
    state.auditLogs = auditLogs || [];
    state.adminSettings = settings;

    // Stat cards
    document.getElementById('adminStatTotalTrips').textContent = stats.totalTrips || 0;
    document.getElementById('adminStatActiveTrips').textContent = `${stats.activeTrips || 0} Active • ${stats.endedTrips || 0} Concluded`;
    document.getElementById('adminStatTotalUsers').textContent = stats.totalUsers || 0;
    document.getElementById('adminStatTotalExpenses').textContent = stats.totalExpenses || 0;
    document.getElementById('adminStatTotalVolume').textContent = `₹${(stats.totalVolume || 0).toLocaleString()}`;

    // Users Table
    const usersTbody = document.getElementById('adminUsersTableBody');
    usersTbody.innerHTML = state.users.map(u => {
      const cleanPhone = u.phone ? u.phone.replace(/[^0-9]/g, '') : '';
      return `
        <tr class="hover:bg-cream-50/70 transition">
          <td class="py-3 px-3.5 flex items-center gap-2.5">
            <img src="${u.avatar || 'https://api.dicebear.com/7.x/notionists/svg?seed=' + u.id}" class="w-7 h-7 rounded-full bg-cream-100">
            <span class="font-bold text-stone-900">${u.name}</span>
          </td>
          <td class="py-3 px-3.5 text-stone-600">${u.email || '-'}</td>
          <td class="py-3 px-3.5">
            ${u.phone ? `
              <div class="flex items-center gap-1.5">
                <span class="font-medium text-stone-800">${u.phone}</span>
                <a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener" class="text-emerald-600 hover:text-emerald-700" title="Chat on WhatsApp">
                  <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                </a>
              </div>
            ` : '<span class="text-stone-400 italic">None</span>'}
          </td>
          <td class="py-3 px-3.5 font-mono text-stone-700">${u.upiId || '-'}</td>
          <td class="py-3 px-3.5">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              u.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-cream-200 text-stone-700'
            }">
              ${u.role || 'EMPLOYEE'}
            </span>
          </td>
          <td class="py-3 px-3.5 text-right space-x-1 whitespace-nowrap">
            <button onclick="window.openEditUserModal('${u.id}')" class="px-2 py-1 rounded-lg text-xs font-semibold bg-cream-100 hover:bg-cream-200 text-stone-700 transition" title="Edit User">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="window.handleDeleteUser('${u.id}')" class="px-2 py-1 rounded-lg text-xs font-semibold bg-roseaccent-50 hover:bg-roseaccent-100 text-roseaccent-700 transition" title="Delete User">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Trips Table
    const tripsTbody = document.getElementById('adminTripsTableBody');
    tripsTbody.innerHTML = state.trips.map(t => `
      <tr class="hover:bg-cream-50/70 transition">
        <td class="py-3 px-3.5 font-bold text-stone-900">${t.title}</td>
        <td class="py-3 px-3.5">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            t.mode === 'CORPORATE' ? 'bg-roseaccent-100 text-roseaccent-800' : t.mode === 'HYBRID' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
          }">
            ${t.mode}
          </span>
        </td>
        <td class="py-3 px-3.5 text-stone-600">${t.destination || '-'}</td>
        <td class="py-3 px-3.5">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            t.status === 'ENDED' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
          }">
            ${t.status}
          </span>
        </td>
        <td class="py-3 px-3.5 text-stone-600">${(t.members || []).length} members</td>
        <td class="py-3 px-3.5 text-right space-x-1.5 whitespace-nowrap">
          <button onclick="selectTrip('${t.id}')" class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-cream-300 text-stone-700 hover:bg-cream-50 transition">
            Switch
          </button>
          <button onclick="window.handleToggleEndTrip('${t.id}')" class="px-2.5 py-1 rounded-lg text-xs font-semibold ${
            t.status === 'ENDED' ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-cream-100 text-stone-700 hover:bg-cream-200'
          } transition">
            ${t.status === 'ENDED' ? 'Reopen' : 'End'}
          </button>
          <button onclick="window.handleDeleteTrip('${t.id}')" class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-roseaccent-50 hover:bg-roseaccent-100 text-roseaccent-700 transition" title="Delete Trip">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </td>
      </tr>
    `).join('');

    // Settings
    if (settings) {
      document.getElementById('adminSettingPerDiem').value = settings.defaultPerDiemLimit || 3000;
      document.getElementById('adminSettingReceiptThreshold').value = settings.defaultReceiptRequiredThreshold || 500;
    }

    // Audit Logs
    const auditList = document.getElementById('adminAuditLogsList');
    if (auditLogs.length === 0) {
      auditList.innerHTML = '<div class="text-stone-400 italic text-xs py-3 text-center">No audit log entries recorded yet.</div>';
    } else {
      auditList.innerHTML = auditLogs.map(l => {
        const timeStr = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = new Date(l.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
        return `
          <div class="flex items-center justify-between py-2 border-b border-cream-100 last:border-0 text-xs">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-cream-100 text-stone-700 font-mono">
                ${l.action}
              </span>
              <span class="text-stone-800 font-medium">${l.details}</span>
            </div>
            <span class="text-[10px] text-stone-400 whitespace-nowrap">${dateStr} ${timeStr}</span>
          </div>
        `;
      }).join('');
    }

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Failed to render admin panel:', err);
  }
}

// ==================== MODAL OPERATIONS ====================

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function openAddExpenseModal() {
  const trip = state.currentTrip;
  if (!trip) {
    showToast('Please create a trip first', 'warning');
    openModal('modalNewTrip');
    return;
  }

  if (trip.status === 'ENDED') {
    showToast('This trip is concluded and locked. Reopen the trip in order to record new expenses.', 'warning');
    return;
  }

  document.getElementById('modalCurrencySymbol').textContent = trip.currencySymbol || '₹';
  document.getElementById('expDate').value = new Date().toISOString().split('T')[0];

  // Reset file upload dropzone & location
  removeUploadedReceipt();
  state.pendingLocation = null;
  document.getElementById('expenseLocationBadge').classList.add('hidden');
  document.getElementById('lblCaptureLocation').textContent = 'Capture Location';
  document.getElementById('expLocationName').value = '';

  // Populate Paid By dropdown
  const paidBySelect = document.getElementById('expPaidBy');
  paidBySelect.innerHTML = trip.members.map(mId => {
    const u = state.users.find(user => user.id === mId) || { id: mId, name: mId };
    return `<option value="${u.id}" ${u.id === state.currentUser ? 'selected' : ''}>${u.name}</option>`;
  }).join('');

  // Populate Split Checkboxes
  const splitBox = document.getElementById('splitMembersCheckboxes');
  splitBox.innerHTML = trip.members.map(mId => {
    const u = state.users.find(user => user.id === mId) || { id: mId, name: mId };
    return `
      <label class="flex items-center justify-between text-xs cursor-pointer hover:bg-cream-100 p-1.5 rounded-lg">
        <span class="font-medium text-stone-800">${u.name}</span>
        <input type="checkbox" name="splitUser" value="${u.id}" checked class="rounded border-cream-300 text-roseaccent-600 focus:ring-roseaccent-500 w-4 h-4">
      </label>
    `;
  }).join('');

  // Add event listener to split checkboxes
  splitBox.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateSplitPreview);
  });

  updateSplitPreview();
  openModal('modalAddExpense');
}

function updateSplitPreview() {
  const amount = Number(document.getElementById('expAmount').value) || 0;
  const checkedBoxes = document.querySelectorAll('input[name="splitUser"]:checked');
  const count = checkedBoxes.length || 1;
  const share = Math.round((amount / count) * 100) / 100;
  const sym = state.currentTrip ? state.currentTrip.currencySymbol : '₹';

  document.getElementById('splitSharePreview').textContent = `Estimated share: ${sym}${share} / person (${count} sharing)`;
}

function openSettleModal() {
  const trip = state.currentTrip;
  if (!trip) return;

  const fromSel = document.getElementById('settleFromUser');
  const toSel = document.getElementById('settleToUser');

  const memberOptions = trip.members.map(mId => {
    const u = state.users.find(user => user.id === mId) || { id: mId, name: mId };
    return `<option value="${u.id}">${u.name}</option>`;
  }).join('');

  fromSel.innerHTML = memberOptions;
  toSel.innerHTML = memberOptions;

  if (trip.members.length > 1) {
    toSel.selectedIndex = 1;
  }

  document.getElementById('settleAmount').value = '';
  document.getElementById('settleReference').value = '';
  openModal('modalSettlePayment');
}

window.prefillSettleModal = function(fromUser, toUser, amount) {
  openSettleModal();
  document.getElementById('settleFromUser').value = fromUser;
  document.getElementById('settleToUser').value = toUser;
  document.getElementById('settleAmount').value = amount;
  document.getElementById('settleReference').value = 'Settled via UPI / Cash';
};

// ==================== RECEIPT FILE & LIGHTBOX ====================

function handleReceiptFileSelected(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    state.pendingReceiptData = {
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      type: file.type,
      dataUrl: e.target.result
    };

    document.getElementById('receiptDropzone').classList.add('hidden');
    document.getElementById('receiptPreviewBox').classList.remove('hidden');
    document.getElementById('receiptFileName').textContent = file.name;
    document.getElementById('receiptFileSize').textContent = state.pendingReceiptData.size;

    const thumbImg = document.getElementById('receiptThumbnailImg');
    const fileIcon = document.getElementById('receiptFileIcon');

    if (file.type.startsWith('image/')) {
      thumbImg.src = e.target.result;
      thumbImg.classList.remove('hidden');
      fileIcon.classList.add('hidden');
    } else {
      thumbImg.classList.add('hidden');
      fileIcon.classList.remove('hidden');
    }

    if (window.lucide) lucide.createIcons();
    showToast(`Receipt attached: ${file.name}`, 'info');
  };
  reader.readAsDataURL(file);
}

function removeUploadedReceipt() {
  state.pendingReceiptData = null;
  const fileInput = document.getElementById('expReceiptFileInput');
  if (fileInput) fileInput.value = '';
  const dropzone = document.getElementById('receiptDropzone');
  const previewBox = document.getElementById('receiptPreviewBox');
  if (dropzone) dropzone.classList.remove('hidden');
  if (previewBox) previewBox.classList.add('hidden');
}

window.viewReceipt = function(expenseId) {
  const exp = state.expenses.find(e => e.id === expenseId) || (state.allTripsExpenses || []).find(e => e.id === expenseId);
  if (!exp) return;

  const dataUrl = exp.receiptData || (exp.receipt && exp.receipt.startsWith('data:') ? exp.receipt : null);
  const name = exp.receipt || 'Receipt';
  const payer = state.users.find(u => u.id === exp.paidBy) || { name: exp.paidBy };
  const sym = exp.currency === 'USD' ? '$' : '₹';

  showReceiptLightbox({
    title: exp.title,
    subtitle: `Paid by ${payer.name} • ${sym}${exp.amount} on ${exp.date}`,
    dataUrl,
    name,
    type: dataUrl && dataUrl.startsWith('data:application/pdf') ? 'application/pdf' : 'image'
  });
};

function showReceiptLightbox({ title, subtitle, dataUrl, name, type }) {
  document.getElementById('receiptViewerTitle').textContent = title;
  document.getElementById('receiptViewerSubtitle').textContent = subtitle;

  const imgEl = document.getElementById('receiptViewerImage');
  const pdfFallback = document.getElementById('receiptViewerPdfFallback');
  const downloadBtn = document.getElementById('receiptDownloadBtn');
  const pdfLink = document.getElementById('receiptPdfOpenLink');

  if (dataUrl) {
    downloadBtn.href = dataUrl;
    downloadBtn.download = name || 'receipt_document';
    pdfLink.href = dataUrl;

    if (type && type.includes('pdf')) {
      imgEl.classList.add('hidden');
      pdfFallback.classList.remove('hidden');
    } else {
      imgEl.src = dataUrl;
      imgEl.classList.remove('hidden');
      pdfFallback.classList.add('hidden');
    }
  } else {
    // Simulated receipt fallback
    imgEl.src = `https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80`;
    imgEl.classList.remove('hidden');
    pdfFallback.classList.add('hidden');
    downloadBtn.href = imgEl.src;
    downloadBtn.download = 'mock_receipt.jpg';
  }

  openModal('modalReceiptViewer');
}

// ==================== LIVE LOCATION CAPTURE ====================

function captureLiveLocation() {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser', 'error');
    return;
  }

  const lbl = document.getElementById('lblCaptureLocation');
  lbl.textContent = 'Locating GPS...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = Math.round(pos.coords.latitude * 10000) / 10000;
      const lng = Math.round(pos.coords.longitude * 10000) / 10000;

      state.pendingLocation = {
        lat,
        lng,
        name: document.getElementById('expLocationName').value || `GPS (${lat}, ${lng})`
      };

      document.getElementById('expenseLocationBadge').classList.remove('hidden');
      document.getElementById('locationBadgeText').textContent = `Coordinates: ${lat}, ${lng}`;
      lbl.textContent = 'GPS Tagged';

      if (!document.getElementById('expLocationName').value) {
        document.getElementById('expLocationName').value = 'Current Geotagged Location';
      }

      showToast('Live GPS coordinates attached!', 'success');
      if (window.lucide) lucide.createIcons();
    },
    (err) => {
      lbl.textContent = 'Capture Location';
      showToast(`Could not retrieve GPS: ${err.message}`, 'warning');
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

// ==================== FORM ACTIONS ====================

async function handleAddExpense(e) {
  e.preventDefault();
  const trip = state.currentTrip;
  if (!trip) return;

  if (trip.status === 'ENDED') {
    showToast('This trip is ended. Reopen the trip in order to record new expenses.', 'warning');
    return;
  }

  const checkedMembers = Array.from(document.querySelectorAll('input[name="splitUser"]:checked')).map(cb => cb.value);
  if (checkedMembers.length === 0) {
    showToast('Select at least one member to share the expense', 'error');
    return;
  }

  let locationPayload = null;
  if (state.pendingLocation) {
    locationPayload = {
      lat: state.pendingLocation.lat,
      lng: state.pendingLocation.lng,
      name: document.getElementById('expLocationName').value || state.pendingLocation.name
    };
  } else if (document.getElementById('expLocationName').value.trim()) {
    locationPayload = {
      lat: 19.076,
      lng: 72.8777,
      name: document.getElementById('expLocationName').value.trim()
    };
  }

  const payload = {
    title: document.getElementById('expTitle').value,
    amount: document.getElementById('expAmount').value,
    category: document.getElementById('expCategory').value,
    paidBy: document.getElementById('expPaidBy').value,
    date: document.getElementById('expDate').value,
    splitType: 'EQUAL',
    splits: checkedMembers,
    receipt: state.pendingReceiptData ? state.pendingReceiptData.name : null,
    receiptData: state.pendingReceiptData ? state.pendingReceiptData.dataUrl : null,
    location: locationPayload,
    isReimbursable: trip.mode === 'CORPORATE'
  };

  try {
    const created = await api(`/trips/${trip.id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    document.getElementById('modalAddExpense').classList.add('hidden');
    document.getElementById('formAddExpense').reset();
    removeUploadedReceipt();
    state.pendingLocation = null;

    showToast(`Recorded "${created.title}" successfully!`, 'success');
    if (created.policyFlags && created.policyFlags.length > 0) {
      showToast(`Warning: Policy flag triggered (${created.policyFlags[0].code})`, 'warning');
    }

    await selectTrip(trip.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleNewTrip(e) {
  e.preventDefault();
  const mode = document.querySelector('input[name="tripModeOption"]:checked').value;
  const memberNamesRaw = document.getElementById('tripMemberNames') ? document.getElementById('tripMemberNames').value : '';
  const memberNames = memberNamesRaw ? memberNamesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const payload = {
    title: document.getElementById('tripName').value,
    mode,
    destination: document.getElementById('tripDestination').value,
    budget: document.getElementById('tripBudget').value,
    currency: 'INR',
    currencySymbol: '₹',
    memberNames: memberNames.length > 0 ? memberNames : ['You'],
    corporateConfig: (mode === 'CORPORATE' || mode === 'HYBRID') ? {
      costCenter: document.getElementById('corpInputCostCenter').value,
      perDiemLimit: document.getElementById('corpInputPerDiem').value,
      receiptRequiredThreshold: 500
    } : null
  };

  try {
    const newTrip = await api('/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    document.getElementById('modalNewTrip').classList.add('hidden');
    document.getElementById('formNewTrip').reset();

    showToast(`Created trip "${newTrip.title}"!`, 'success');
    await fetchUsers();
    await fetchTrips();
    await selectTrip(newTrip.id);
  } catch (err) {
    showToast('Failed to create trip', 'error');
  }
}

async function handleSettlePayment(e) {
  e.preventDefault();
  const trip = state.currentTrip;
  if (!trip) return;

  const fromUser = document.getElementById('settleFromUser').value;
  const toUser = document.getElementById('settleToUser').value;

  if (fromUser === toUser) {
    showToast('Payer and Receiver must be different people', 'error');
    return;
  }

  const payload = {
    fromUser,
    toUser,
    amount: document.getElementById('settleAmount').value,
    reference: document.getElementById('settleReference').value
  };

  try {
    await api(`/trips/${trip.id}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    document.getElementById('modalSettlePayment').classList.add('hidden');
    document.getElementById('formSettlePayment').reset();

    showToast('Settlement logged and balances updated!', 'success');
    await selectTrip(trip.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleAddMember(e) {
  e.preventDefault();
  const trip = state.currentTrip;

  const payload = {
    name: document.getElementById('newMemberName').value,
    email: document.getElementById('newMemberEmail').value,
    phone: document.getElementById('newMemberPhone') ? document.getElementById('newMemberPhone').value : '',
    upiId: document.getElementById('newMemberUpi').value,
    role: document.getElementById('newMemberRole') ? document.getElementById('newMemberRole').value : 'EMPLOYEE'
  };

  try {
    const newUser = await api('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (newUser) {
      state.users.push(newUser);
      if (trip && !trip.members.includes(newUser.id)) {
        trip.members.push(newUser.id);
      }
    }

    document.getElementById('modalAddMember').classList.add('hidden');
    document.getElementById('formAddMember').reset();

    showToast(`Added ${newUser.name} successfully!`, 'success');
    if (trip) await selectTrip(trip.id);
    if (state.activeTab === 'admin') renderAdminTab();
  } catch (err) {
    showToast('Failed to add member', 'error');
  }
}

window.openEditUserModal = function(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('editUserId').value = user.id;
  document.getElementById('editUserName').value = user.name || '';
  document.getElementById('editUserEmail').value = user.email || '';
  document.getElementById('editUserPhone').value = user.phone || '';
  document.getElementById('editUserUpi').value = user.upiId || '';
  document.getElementById('editUserRole').value = user.role || 'EMPLOYEE';

  openModal('modalEditUser');
};

async function handleEditUser(e) {
  e.preventDefault();
  const userId = document.getElementById('editUserId').value;
  const payload = {
    name: document.getElementById('editUserName').value,
    email: document.getElementById('editUserEmail').value,
    phone: document.getElementById('editUserPhone').value,
    upiId: document.getElementById('editUserUpi').value,
    role: document.getElementById('editUserRole').value
  };

  try {
    const updated = await api(`/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const idx = state.users.findIndex(u => u.id === userId);
    if (idx !== -1) state.users[idx] = updated;

    document.getElementById('modalEditUser').classList.add('hidden');
    showToast(`Updated ${updated.name} successfully!`, 'success');
    if (state.activeTab === 'admin') renderAdminTab();
    if (state.currentTrip) renderAll();
  } catch (err) {
    showToast('Failed to update user', 'error');
  }
}

window.handleDeleteUser = async function(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!confirm(`Are you sure you want to remove ${user ? user.name : 'this user'}?`)) return;

  try {
    await api(`/users/${userId}`, { method: 'DELETE' });
    state.users = state.users.filter(u => u.id !== userId);
    showToast('User removed', 'info');
    if (state.activeTab === 'admin') renderAdminTab();
    if (state.currentTrip) renderAll();
  } catch (err) {
    showToast('Failed to delete user', 'error');
  }
};

window.handleToggleEndTrip = async function(tripId) {
  try {
    const updated = await api(`/trips/${tripId}/toggle-end`, { method: 'POST' });
    const idx = state.trips.findIndex(t => t.id === tripId);
    if (idx !== -1) state.trips[idx] = updated;

    if (state.currentTrip && state.currentTrip.id === tripId) {
      state.currentTrip = updated;
    }

    renderTripSelector();

    if (updated.status === 'ENDED') {
      showToast(`Trip "${updated.title}" concluded & locked! Showing Home overview.`, 'info');
      await renderHomeView();
    } else {
      showToast(`Trip "${updated.title}" reopened and active!`, 'success');
      await selectTrip(tripId);
    }
  } catch (err) {
    showToast('Failed to toggle trip status', 'error');
  }
};

window.handleDeleteTrip = async function(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!confirm(`Permanently delete trip "${trip ? trip.title : tripId}" and all its expenses?`)) return;

  try {
    await api(`/trips/${tripId}`, { method: 'DELETE' });
    state.trips = state.trips.filter(t => t.id !== tripId);
    showToast('Trip deleted', 'info');
    await fetchTrips();
    if (state.trips.length > 0) {
      await selectTrip(state.trips[0].id);
    } else {
      renderEmptyState();
    }
    if (state.activeTab === 'admin') renderAdminTab();
  } catch (err) {
    showToast('Failed to delete trip', 'error');
  }
};

async function handleAdminSettingsSave(e) {
  e.preventDefault();
  const payload = {
    defaultPerDiemLimit: Number(document.getElementById('adminSettingPerDiem').value),
    defaultReceiptRequiredThreshold: Number(document.getElementById('adminSettingReceiptThreshold').value)
  };

  try {
    await api('/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    showToast('Global corporate policies saved!', 'success');
    renderAdminTab();
  } catch (err) {
    showToast('Failed to save settings', 'error');
  }
}

async function handleAdminExportBackup() {
  try {
    const backupData = await api('/admin/backup');
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnivance_ledger_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Database backup downloaded!', 'success');
  } catch (err) {
    showToast('Failed to export backup', 'error');
  }
}

function handleAdminRestoreBackup(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (!parsed.trips || !parsed.users) {
        showToast('Invalid backup file schema', 'error');
        return;
      }

      await api('/admin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: parsed })
      });

      showToast('Database restored successfully!', 'success');
      await fetchUsers();
      await fetchTrips();
      if (state.trips.length > 0) {
        await selectTrip(state.trips[0].id);
      } else {
        renderEmptyState();
      }
      renderAdminTab();
    } catch (err) {
      showToast('Failed to parse backup JSON file', 'error');
    }
  };
  reader.readAsText(file);
}

async function handleAdminCleanReset() {
  if (!confirm('CAUTION: Are you sure you want to reset the database to a clean, empty state?')) return;
  try {
    await api('/reset', { method: 'POST' });
    showToast('Database reset to clean state', 'info');
    await fetchUsers();
    await fetchTrips();
    renderEmptyState();
    renderAdminTab();
  } catch (err) {
    showToast('Failed to reset database', 'error');
  }
}

window.handleDeleteExpense = async function(id) {
  if (!confirm('Are you sure you want to delete this expense?')) return;
  try {
    await api(`/expenses/${id}`, { method: 'DELETE' });
    showToast('Expense removed', 'info');
    await selectTrip(state.currentTrip.id);
  } catch (err) {
    showToast('Failed to delete expense', 'error');
  }
};

async function handleApprovalAction(action) {
  const trip = state.currentTrip;
  if (!trip) return;

  try {
    await api(`/trips/${trip.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, approverId: 'u_sarah' })
    });

    showToast(`Corporate report status updated to ${action}!`, action === 'APPROVE' ? 'success' : 'warning');
    await selectTrip(trip.id);
  } catch (err) {
    showToast('Failed to update approval status', 'error');
  }
}

window.copyToClipboard = function(text, label = 'Text') {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(`${label} copied to clipboard!`, 'success');
  }).catch(() => {
    showToast('Could not copy to clipboard', 'error');
  });
};

// ==================== TOAST NOTIFICATION SYSTEM ====================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');

  const bgStyles = {
    success: 'bg-emerald-900/90 text-white border-emerald-700',
    error: 'bg-roseaccent-950/90 text-white border-roseaccent-800',
    warning: 'bg-amber-900/90 text-white border-amber-700',
    info: 'bg-stone-900/90 text-white border-stone-700'
  };

  const iconName = {
    success: 'check-circle-2',
    error: 'alert-circle',
    warning: 'alert-triangle',
    info: 'info'
  }[type] || 'info';

  toast.className = `p-3.5 rounded-2xl shadow-xl border text-xs font-semibold backdrop-blur-md flex items-center gap-2.5 transform transition-all duration-300 translate-y-4 opacity-0 pointer-events-auto ${bgStyles[type]}`;
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-x-4');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

window.selectTrip = selectTrip;
