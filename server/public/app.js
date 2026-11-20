/**
 * Omnivance Ledger — Frontend Application
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
  currentUser: 'u_alex' // Default simulated active session user
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
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return { users: [], trips: [], expenses: [], settlements: [] };
  },
  save(data) {
    try {
      localStorage.setItem('omnivance_ledger_db', JSON.stringify(data));
    } catch (e) {}
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
    const user = db.users.find(u => u.id === mId) || { id: mId, name: mId, avatar: '' };
    const net = Math.round((memberBalances[mId] || 0) * 100) / 100;
    return {
      userId: mId,
      name: user.name,
      email: user.email,
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

  if (amt >= threshold && (!expense.receipt || expense.receipt.trim() === '')) {
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

  if (path === '/users' && method === 'GET') return db.users;
  if (path === '/users' && method === 'POST') {
    const newUser = {
      id: `u_${Date.now()}`,
      name: body.name,
      email: body.email || '',
      upiId: body.upiId || '',
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(body.name)}`,
      role: 'EMPLOYEE'
    };
    db.users.push(newUser);
    localDb.save(db);
    return newUser;
  }

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
    return newTrip;
  }

  if (path.startsWith('/trips/') && method === 'GET') {
    const parts = path.split('/');
    const tripId = parts[2];
    if (parts.length === 3) return db.trips.find(t => t.id === tripId);
    if (parts[3] === 'expenses') return db.expenses.filter(e => e.tripId === tripId);
    if (parts[3] === 'balances') return clientCalculateBalances(tripId);
  }

  if (path.startsWith('/trips/') && path.endsWith('/expenses') && method === 'POST') {
    const tripId = path.split('/')[2];
    const trip = db.trips.find(t => t.id === tripId);
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
      receipt: body.receipt || null,
      notes: body.notes || '',
      policyFlags: []
    };
    newExp.policyFlags = clientEvaluatePolicy(newExp, trip);
    db.expenses.unshift(newExp);
    localDb.save(db);
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
    return { settlement: newSettle, updatedBalances: clientCalculateBalances(tripId) };
  }

  if (path.startsWith('/trips/') && path.endsWith('/approve') && method === 'POST') {
    const tripId = path.split('/')[2];
    const trip = db.trips.find(t => t.id === tripId);
    if (trip && trip.corporateConfig) {
      trip.corporateConfig.approvalStatus = body.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      localDb.save(db);
    }
    return { trip };
  }

  if (path.startsWith('/expenses/') && method === 'DELETE') {
    const expId = path.split('/')[2];
    db.expenses = db.expenses.filter(e => e.id !== expId);
    localDb.save(db);
    return { success: true };
  }

  if (path === '/expenses' && method === 'GET') return db.expenses;

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

async function selectTrip(tripId) {
  if (!tripId) {
    renderEmptyState();
    return;
  }
  document.getElementById('noTripsContainer').classList.add('hidden');
  document.getElementById('activeTripDashboard').classList.remove('hidden');

  state.currentTrip = await api(`/trips/${tripId}`);
  const [expenses, balances] = await Promise.all([
    api(`/trips/${tripId}/expenses`),
    api(`/trips/${tripId}/balances`)
  ]);

  state.expenses = expenses || [];
  state.balances = balances || null;

  if (state.currentTrip && state.currentTrip.members && state.currentTrip.members.length > 0) {
    state.currentUser = state.currentTrip.members[0];
  }

  renderTripSelector();
  renderAll();
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
  // Trip selector change
  document.getElementById('tripSelector').addEventListener('change', (e) => {
    selectTrip(e.target.value);
  });

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

  // Mock Receipt Simulation button
  document.getElementById('btnSimulateReceipt').addEventListener('click', () => {
    const receipts = ['uber_receipt_e92.pdf', 'hotel_invoice_final.png', 'restaurant_tax_bill.jpg', 'airline_ticket_boarding.pdf'];
    const chosen = receipts[Math.floor(Math.random() * receipts.length)];
    document.getElementById('expReceipt').value = chosen;
    showToast(`Simulated receipt attached: ${chosen}`, 'info');
  });

  // Export CSV (Dual engine: works on GitHub Pages & Localhost)
  document.getElementById('btnExportCsv').addEventListener('click', () => {
    if (!state.currentTrip) return;
    const trip = state.currentTrip;
    let csv = `Date,Expense ID,Title,Category,Amount (${trip.currency}),Paid By,Splits,Policy Flags,Receipt\n`;
    state.expenses.forEach(e => {
      const payer = state.users.find(u => u.id === e.paidBy);
      const payerName = payer ? payer.name : e.paidBy;
      const splitsStr = (e.splits || []).map(s => {
        const u = state.users.find(user => user.id === s.userId);
        return `${u ? u.name : s.userId}:${s.amount}`;
      }).join('; ');
      const flagsStr = (e.policyFlags || []).map(f => f.code).join('; ');
      csv += `"${e.date}","${e.id}","${(e.title || '').replace(/"/g, '""')}","${e.category}",${e.amount},"${payerName}","${splitsStr}","${flagsStr}","${e.receipt || 'None'}"\n`;
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
        const res = await fetch(`${API_BASE}/expenses`);
        state.allTripsExpenses = await res.json();
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
  }

  if (window.lucide) lucide.createIcons();
}

// ==================== RENDERING LOGIC ====================

function renderAll() {
  if (!state.currentTrip) return;

  renderTripHeader();
  renderTopStats();
  renderExpensesList();
  renderBalancesTab();
  renderCorporateTab();
  renderMembersTab();
  renderAllExpensesTab();

  if (window.lucide) lucide.createIcons();
}

function renderTripSelector() {
  const sel = document.getElementById('tripSelector');
  sel.innerHTML = state.trips.map(t => `
    <option value="${t.id}" ${state.currentTrip && state.currentTrip.id === t.id ? 'selected' : ''}>
      ${t.title} (${t.mode})
    </option>
  `).join('');
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
  if (isCorporate && trip.corporateConfig) {
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
  document.getElementById('budgetProgressBar').className = pct > 90 ? 'bg-roseaccent-600 h-full rounded-full transition-all duration-500' : 'bg-emerald-500 h-full rounded-full transition-all duration-500';

  // Card 2: Your Balance (Simulated active session for Alex)
  const myData = state.balances ? state.balances.membersSummary.find(m => m.userId === state.currentUser) : null;
  const balEl = document.getElementById('cardUserBalance');
  const subEl = document.getElementById('cardBalanceSubtext');

  if (myData) {
    if (myData.netBalance > 0.01) {
      balEl.textContent = `+${sym}${myData.netBalance.toLocaleString()}`;
      balEl.className = 'text-2xl sm:text-3xl font-bold text-emerald-700';
      subEl.innerHTML = `<i data-lucide="arrow-down-left" class="w-3.5 h-3.5 text-emerald-600"></i> You are owed this amount`;
      subEl.className = 'text-xs text-emerald-700 font-medium mt-2 flex items-center gap-1';
    } else if (myData.netBalance < -0.01) {
      balEl.textContent = `-${sym}${Math.abs(myData.netBalance).toLocaleString()}`;
      balEl.className = 'text-2xl sm:text-3xl font-bold text-roseaccent-800';
      subEl.innerHTML = `<i data-lucide="arrow-up-right" class="w-3.5 h-3.5 text-roseaccent-600"></i> You owe this amount`;
      subEl.className = 'text-xs text-roseaccent-700 font-medium mt-2 flex items-center gap-1';
    } else {
      balEl.textContent = `${sym}0.00`;
      balEl.className = 'text-2xl sm:text-3xl font-bold text-stone-700';
      subEl.innerHTML = `<i data-lucide="check-check" class="w-3.5 h-3.5 text-stone-500"></i> All settled up`;
      subEl.className = 'text-xs text-stone-500 font-medium mt-2 flex items-center gap-1';
    }
  }

  // Card 3: Members Count & Avatar Stack
  const members = trip.members || [];
  document.getElementById('cardMemberCount').textContent = members.length;
  const avatarStack = document.getElementById('cardAvatarStack');
  avatarStack.innerHTML = members.slice(0, 5).map(mId => {
    const user = state.users.find(u => u.id === mId) || { name: mId, avatar: '' };
    return `<img class="inline-block h-7 w-7 rounded-full ring-2 ring-white bg-cream-200" src="${user.avatar || 'https://api.dicebear.com/7.x/notionists/svg?seed=' + mId}" alt="${user.name}" title="${user.name}">`;
  }).join('');

  // Card 4: Mode & Compliance Guard
  const policyTitle = document.getElementById('cardPolicyTitle');
  const policyDesc = document.getElementById('cardPolicyDesc');
  const corpPill = document.getElementById('cardCorporateStatusPill');

  if (trip.mode === 'CORPORATE') {
    policyTitle.textContent = 'Corporate T&E Mode';
    policyDesc.textContent = `Policy rule: Receipts mandatory ≥ ${sym}${trip.corporateConfig ? trip.corporateConfig.receiptRequiredThreshold : 500}`;
    corpPill.classList.remove('hidden');
    corpPill.innerHTML = `
      <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-roseaccent-800 bg-roseaccent-100 px-2 py-0.5 rounded-md border border-roseaccent-200">
        <i data-lucide="check-circle-2" class="w-3 h-3 text-roseaccent-600"></i>
        Cost Center: ${trip.corporateConfig ? trip.corporateConfig.costCenter : 'General'}
      </span>
    `;
  } else if (trip.mode === 'HYBRID') {
    policyTitle.textContent = 'Team Offsite Mode';
    policyDesc.textContent = 'Blended company reimbursement & peer personal splits.';
    corpPill.classList.add('hidden');
  } else {
    policyTitle.textContent = 'Friends Social Mode';
    policyDesc.textContent = 'Direct peer-to-peer splitting with minimum debt transactions.';
    corpPill.classList.add('hidden');
  }

  // Counts
  document.getElementById('badgeExpenseCount').textContent = state.expenses.length;
  const transfersCount = state.balances && state.balances.simplifiedTransfers ? state.balances.simplifiedTransfers.length : 0;
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

    const splitsSummary = exp.splits.map(s => {
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
                ${exp.receipt ? `
                  <span class="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <i data-lucide="file-check" class="w-3 h-3 text-emerald-600"></i> Receipt
                  </span>
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
              <div class="text-[11px] text-stone-400 font-medium">${exp.splits.length} participants</div>
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
  if (!state.balances) return;

  const sym = state.balances.currencySymbol || '₹';
  const transfers = state.balances.simplifiedTransfers || [];
  const settlementsContainer = document.getElementById('settlementsList');

  if (transfers.length === 0) {
    settlementsContainer.innerHTML = `
      <div class="p-8 text-center bg-cream-50 rounded-2xl border border-cream-300">
        <i data-lucide="sparkles" class="w-8 h-8 mx-auto text-emerald-600 mb-2"></i>
        <div class="text-sm font-bold text-stone-800">Everyone is fully settled up!</div>
        <p class="text-xs text-stone-500 mt-0.5">No outstanding debts remaining on this trip.</p>
      </div>
    `;
  } else {
    settlementsContainer.innerHTML = transfers.map(t => {
      const fromUser = state.users.find(u => u.id === t.fromUser) || { name: t.fromName };
      const toUser = state.users.find(u => u.id === t.toUser) || { name: t.toName, upiId: t.toUpiId };

      return `
        <div class="p-4 rounded-2xl bg-white border border-cream-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-roseaccent-200 transition">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-roseaccent-100 text-roseaccent-700 flex items-center justify-center font-bold text-xs shrink-0">
              <i data-lucide="send" class="w-4 h-4"></i>
            </div>
            <div>
              <div class="text-sm font-bold text-stone-900">
                <span>${fromUser.name}</span>
                <span class="text-xs font-normal text-stone-500 mx-1">pays</span>
                <span class="text-roseaccent-800">${toUser.name}</span>
              </div>
              <p class="text-xs text-stone-400">UPI Handle: ${toUser.upiId || 'Not registered'}</p>
            </div>
          </div>

          <div class="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-cream-200">
            <span class="text-base font-extrabold text-stone-900">${sym}${t.amount.toLocaleString()}</span>
            
            <div class="flex items-center gap-2">
              ${t.upiPaymentUrl ? `
                <a href="${t.upiPaymentUrl}" target="_blank" class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 shadow-sm transition">
                  <i data-lucide="smartphone" class="w-3.5 h-3.5"></i>
                  <span>Pay UPI</span>
                </a>
              ` : ''}

              <button onclick="prefillSettleModal('${t.fromUser}', '${t.toUser}', ${t.amount})" class="btn-rose-subtle px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1">
                <i data-lucide="check" class="w-3.5 h-3.5"></i>
                <span>Mark Paid</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Right column: Individual Member Shares Breakdown
  const membersBalanceContainer = document.getElementById('membersBalanceList');
  const summary = state.balances.membersSummary || [];

  membersBalanceContainer.innerHTML = summary.map(m => {
    const isCreditor = m.netBalance > 0.01;
    const isDebtor = m.netBalance < -0.01;

    return `
      <div class="p-3.5 rounded-xl bg-cream-50 border border-cream-200 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <img src="${m.avatar || 'https://api.dicebear.com/7.x/notionists/svg?seed=' + m.userId}" class="w-8 h-8 rounded-full bg-cream-200" alt="${m.name}">
          <div>
            <div class="text-xs font-bold text-stone-800">${m.name}</div>
            <div class="text-[10px] text-stone-500">Paid: ${sym}${m.totalPaid} • Share: ${sym}${m.totalShare}</div>
          </div>
        </div>

        <div class="text-right">
          <div class="text-xs font-bold ${isCreditor ? 'text-emerald-700' : isDebtor ? 'text-roseaccent-700' : 'text-stone-500'}">
            ${isCreditor ? '+' : ''}${sym}${m.netBalance}
          </div>
          <span class="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
            isCreditor ? 'bg-emerald-100 text-emerald-800' : isDebtor ? 'bg-roseaccent-100 text-roseaccent-800' : 'bg-cream-200 text-stone-600'
          }">
            ${isCreditor ? 'Gets back' : isDebtor ? 'Owes' : 'Settled'}
          </span>
        </div>
      </div>
    `;
  }).join('');

  // Settlement History
  const historyContainer = document.getElementById('historySettlementsList');
  const history = state.balances.completedSettlements || [];
  if (history.length === 0) {
    historyContainer.innerHTML = `<p class="text-stone-400 italic">No manual settlements logged yet.</p>`;
  } else {
    historyContainer.innerHTML = history.map(h => {
      const fromU = state.users.find(u => u.id === h.fromUser) || { name: h.fromUser };
      const toU = state.users.find(u => u.id === h.toUser) || { name: h.toUser };
      return `
        <div class="p-2.5 rounded-lg bg-cream-50 border border-cream-200 flex items-center justify-between">
          <span><strong>${fromU.name}</strong> paid <strong>${toU.name}</strong> (${h.reference || 'Settlement'})</span>
          <span class="font-bold text-emerald-700">${sym}${h.amount}</span>
        </div>
      `;
    }).join('');
  }

  if (window.lucide) lucide.createIcons();
}

function renderCorporateTab() {
  const trip = state.currentTrip;
  if (!trip || (trip.mode !== 'CORPORATE' && trip.mode !== 'HYBRID')) return;

  const cfg = trip.corporateConfig || {};
  const sym = trip.currencySymbol || '₹';

  document.getElementById('corpCostCenter').textContent = cfg.costCenter || 'N/A';
  document.getElementById('corpPerDiemLimit').textContent = `${sym}${(cfg.perDiemLimit || 3000).toLocaleString()} / day`;
  document.getElementById('corpReceiptThreshold').textContent = `Expenses ≥ ${sym}${cfg.receiptRequiredThreshold || 500}`;

  const badge = document.getElementById('corpApprovalStatusBadge');
  badge.textContent = cfg.approvalStatus || 'DRAFT';
  badge.className = `text-xs px-2.5 py-1 rounded-full font-bold ${
    cfg.approvalStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
    cfg.approvalStatus === 'REJECTED' ? 'bg-roseaccent-100 text-roseaccent-800 border border-roseaccent-300' :
    'bg-amber-100 text-amber-800 border border-amber-300'
  }`;

  // Collect all policy violations across all expenses
  const allViolations = [];
  state.expenses.forEach(e => {
    if (e.policyFlags && e.policyFlags.length > 0) {
      e.policyFlags.forEach(f => {
        allViolations.push({
          expenseTitle: e.title,
          expenseAmount: e.amount,
          code: f.code,
          message: f.message
        });
      });
    }
  });

  const violationsContainer = document.getElementById('corpViolationsList');
  if (allViolations.length === 0) {
    violationsContainer.innerHTML = `
      <div class="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
        <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-600"></i>
        <span>All expenses are 100% compliant with company travel policies! Ready for reimbursement approval.</span>
      </div>
    `;
  } else {
    violationsContainer.innerHTML = allViolations.map(v => `
      <div class="p-3 rounded-xl bg-roseaccent-50 border border-roseaccent-200 text-xs flex items-start justify-between gap-3">
        <div class="flex items-start gap-2">
          <i data-lucide="alert-octagon" class="w-4 h-4 text-roseaccent-600 shrink-0 mt-0.5"></i>
          <div>
            <div class="font-bold text-roseaccent-900">${v.expenseTitle} (${sym}${v.expenseAmount})</div>
            <div class="text-stone-600 mt-0.5">${v.message}</div>
          </div>
        </div>
        <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-roseaccent-200 text-roseaccent-900 shrink-0">
          ${v.code}
        </span>
      </div>
    `).join('');
  }

  if (window.lucide) lucide.createIcons();
}

function renderMembersTab() {
  const trip = state.currentTrip;
  const sym = trip.currencySymbol || '₹';
  const grid = document.getElementById('membersGrid');
  const summary = state.balances ? state.balances.membersSummary : [];

  grid.innerHTML = (trip.members || []).map(mId => {
    const user = state.users.find(u => u.id === mId) || { id: mId, name: mId, email: '', upiId: '' };
    const memberStats = summary.find(s => s.userId === mId) || { totalPaid: 0, totalShare: 0, netBalance: 0 };

    return `
      <div class="p-4 rounded-2xl bg-white border border-cream-300 flex flex-col justify-between">
        <div class="flex items-center gap-3 mb-3">
          <img src="${user.avatar || 'https://api.dicebear.com/7.x/notionists/svg?seed=' + user.id}" class="w-11 h-11 rounded-full bg-cream-100" alt="${user.name}">
          <div>
            <div class="text-sm font-bold text-stone-900">${user.name}</div>
            <div class="text-xs text-stone-400">${user.email}</div>
            <div class="text-[11px] text-roseaccent-700 font-medium">${user.upiId ? 'UPI: ' + user.upiId : 'No UPI'}</div>
          </div>
        </div>

        <div class="pt-3 border-t border-cream-200 grid grid-cols-2 gap-2 text-xs">
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
    `;
  }).join('');
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
              <div class="text-[10px] text-stone-400 flex items-center gap-1.5 mt-0.5">
                ${tripObj ? `<span class="font-semibold text-roseaccent-700">${tripObj.title}</span> • ` : ''}
                ${e.notes ? `<span>"${e.notes}"</span>` : '<span>No notes</span>'}
                ${e.receipt ? `<span class="text-emerald-700 font-medium">📎 ${e.receipt}</span>` : ''}
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

  document.getElementById('modalCurrencySymbol').textContent = trip.currencySymbol || '₹';
  document.getElementById('expDate').value = new Date().toISOString().split('T')[0];

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

// ==================== FORM ACTIONS ====================

async function handleAddExpense(e) {
  e.preventDefault();
  const trip = state.currentTrip;
  if (!trip) return;

  const checkedMembers = Array.from(document.querySelectorAll('input[name="splitUser"]:checked')).map(cb => cb.value);
  if (checkedMembers.length === 0) {
    showToast('Select at least one member to share the expense', 'error');
    return;
  }

  const payload = {
    title: document.getElementById('expTitle').value,
    amount: document.getElementById('expAmount').value,
    category: document.getElementById('expCategory').value,
    paidBy: document.getElementById('expPaidBy').value,
    date: document.getElementById('expDate').value,
    splitType: 'EQUAL',
    splits: checkedMembers,
    receipt: document.getElementById('expReceipt').value,
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
  if (!trip) return;

  const payload = {
    name: document.getElementById('newMemberName').value,
    email: document.getElementById('newMemberEmail').value,
    upiId: document.getElementById('newMemberUpi').value
  };

  try {
    const newUser = await api('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (newUser) {
      state.users.push(newUser);
      if (!trip.members.includes(newUser.id)) {
        trip.members.push(newUser.id);
      }
    }

    document.getElementById('modalAddMember').classList.add('hidden');
    document.getElementById('formAddMember').reset();

    showToast(`Added ${newUser.name} to the group!`, 'success');
    await selectTrip(trip.id);
  } catch (err) {
    showToast('Failed to add member', 'error');
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

// ==================== TOAST NOTIFICATION SYSTEM ====================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
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
