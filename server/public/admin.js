/**
 * Omnivance Ledger — Dedicated Trip Admin Portal
 * Dual-Engine (REST API & GitHub Pages Client Storage)
 */

const state = {
  trips: [],
  currentTrip: null,
  users: [],
  expenses: [],
  balances: null,
  activeTab: 'settings',
  auditLogs: [],
  isSystemOverview: false
};

const API_BASE = '/api';
const isClientOnly = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

// Client-side Local Storage Database Fallback
const STORAGE_KEY = 'omnivance_ledger_db_v1';
const localDb = {
  load() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
    return { users: [], trips: [], expenses: [], settlements: [], auditLogs: [], settings: {} };
  },
  save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  },
  addAuditLog(action, details) {
    const db = this.load();
    if (!db.auditLogs) db.auditLogs = [];
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      action,
      details,
      timestamp: new Date().toISOString()
    };
    db.auditLogs.unshift(entry);
    this.save(db);
    return entry;
  }
};

// ==================== DUAL-ENGINE API HELPER ====================
async function api(path, options = {}) {
  if (!isClientOnly) {
    try {
      const res = await fetch(`${API_BASE}${path}`, options);
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Backend API unreachable, using local database fallback:', e);
    }
  }

  // Client-Side Offline Handler
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const db = localDb.load();

  if (path === '/users' && method === 'GET') return db.users || [];
  if (path === '/users' && method === 'POST') {
    const u = {
      id: `u_${Date.now()}`,
      name: body.name,
      email: body.email || '',
      phone: body.phone || '',
      upiId: body.upiId || '',
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(body.name)}`,
      role: body.role || 'EMPLOYEE'
    };
    db.users.push(u);
    localDb.save(db);
    localDb.addAuditLog('USER_CREATED', `Admin created user "${u.name}"`);
    return u;
  }

  if (path.startsWith('/users/') && method === 'PUT') {
    const uid = path.split('/')[2];
    const idx = db.users.findIndex(u => u.id === uid);
    if (idx !== -1) {
      db.users[idx] = { ...db.users[idx], ...body };
      localDb.save(db);
      return db.users[idx];
    }
    return null;
  }

  if (path.startsWith('/users/') && method === 'DELETE') {
    const uid = path.split('/')[2];
    db.users = db.users.filter(u => u.id !== uid);
    localDb.save(db);
    return { success: true };
  }

  if (path === '/trips' && method === 'GET') return db.trips || [];

  if (path.startsWith('/trips/') && method === 'GET') {
    const parts = path.split('/');
    const tripId = parts[2];
    if (parts.length === 3) return db.trips.find(t => t.id === tripId);
    if (parts[3] === 'expenses') return (db.expenses || []).filter(e => e.tripId === tripId);
    if (parts[3] === 'balances') {
      const tripExpenses = (db.expenses || []).filter(e => e.tripId === tripId);
      const total = tripExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      return { totalTripSpent: total, netBalances: {}, simplifiedSettlements: [] };
    }
  }

  if (path.startsWith('/trips/') && method === 'PUT') {
    const tripId = path.split('/')[2];
    const idx = db.trips.findIndex(t => t.id === tripId);
    if (idx !== -1) {
      db.trips[idx] = { ...db.trips[idx], ...body };
      localDb.save(db);
      localDb.addAuditLog('TRIP_UPDATED', `Trip "${db.trips[idx].title}" updated by Admin`);
      return db.trips[idx];
    }
    return null;
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
    localDb.save(db);
    localDb.addAuditLog('TRIP_DELETED', `Trip "${trip ? trip.title : tripId}" deleted`);
    return { success: true };
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
    db.expenses = db.expenses.filter(e => e.id !== expId);
    localDb.save(db);
    localDb.addAuditLog('EXPENSE_DELETED', `Expense ${expId} deleted by Admin`);
    return { success: true };
  }

  if (path === '/expenses' && method === 'GET') return db.expenses || [];

  if (path === '/admin/stats' && method === 'GET') {
    const trips = db.trips || [];
    const users = db.users || [];
    const expenses = db.expenses || [];
    const totalVolume = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return {
      totalTrips: trips.length,
      activeTrips: trips.filter(t => t.status !== 'ENDED').length,
      endedTrips: trips.filter(t => t.status === 'ENDED').length,
      totalUsers: users.length,
      totalExpenses: expenses.length,
      totalVolume: Math.round(totalVolume * 100) / 100
    };
  }

  if (path === '/admin/audit-logs' && method === 'GET') {
    return (db.auditLogs || []).slice(0, 50);
  }

  return {};
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadInitialData();
});

async function loadInitialData() {
  try {
    const [users, trips] = await Promise.all([
      api('/users'),
      api('/trips')
    ]);

    state.users = users || [];
    state.trips = trips || [];

    // Parse URL parameters for direct trip sharing
    const urlParams = new URLSearchParams(window.location.search);
    const targetTripId = urlParams.get('tripId');

    renderTripSelector();

    if (targetTripId === '__system__') {
      selectSystemOverview();
    } else if (targetTripId && state.trips.some(t => t.id === targetTripId)) {
      await selectTrip(targetTripId);
    } else if (state.trips.length > 0) {
      await selectTrip(state.trips[0].id);
    } else {
      selectSystemOverview();
    }
  } catch (err) {
    showToast('Failed to load admin data', 'error');
    console.error(err);
  }
}

// ==================== NAVIGATION & SELECTOR ====================
function renderTripSelector() {
  const sel = document.getElementById('adminTripSelector');
  if (!sel) return;

  const currentId = state.isSystemOverview ? '__system__' : (state.currentTrip ? state.currentTrip.id : '');

  const options = [
    `<option value="__system__" ${currentId === '__system__' ? 'selected' : ''}>🌐 Platform System Overview</option>`,
    ...state.trips.map(t => `
      <option value="${t.id}" ${currentId === t.id ? 'selected' : ''}>
        ${t.status === 'ENDED' ? '🔒 [CLOSED] ' : '🟢 '}${escapeHtml(t.title)} (${t.mode})
      </option>
    `)
  ];
  sel.innerHTML = options.join('');
}

async function selectTrip(tripId) {
  state.isSystemOverview = false;
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;

  state.currentTrip = trip;

  // Update URL without full reload for sharing
  const newUrl = `${window.location.pathname}?tripId=${encodeURIComponent(tripId)}`;
  window.history.replaceState({ tripId }, '', newUrl);

  document.getElementById('tripAdminWorkspace').classList.remove('hidden');
  document.getElementById('systemOverviewWorkspace').classList.add('hidden');

  renderTripSelector();

  try {
    const [expenses, balances, logs] = await Promise.all([
      api(`/trips/${tripId}/expenses`),
      api(`/trips/${tripId}/balances`),
      api('/admin/audit-logs')
    ]);

    state.expenses = expenses || [];
    state.balances = balances || null;
    state.auditLogs = logs || [];

    renderTripWorkspace();
  } catch (e) {
    showToast('Error loading trip details', 'error');
  }
}

async function selectSystemOverview() {
  state.isSystemOverview = true;
  state.currentTrip = null;

  const newUrl = `${window.location.pathname}?tripId=__system__`;
  window.history.replaceState({}, '', newUrl);

  document.getElementById('tripAdminWorkspace').classList.add('hidden');
  document.getElementById('systemOverviewWorkspace').classList.remove('hidden');

  renderTripSelector();

  try {
    const [stats, users, trips] = await Promise.all([
      api('/admin/stats'),
      api('/users'),
      api('/trips')
    ]);

    state.systemStats = stats || {};
    state.users = users || [];
    state.trips = trips || [];

    renderSystemOverview();
  } catch (e) {
    showToast('Error loading system overview', 'error');
  }
}

// ==================== TRIP WORKSPACE RENDERING ====================
function renderTripWorkspace() {
  const trip = state.currentTrip;
  if (!trip) return;

  // Hero Metadata
  document.getElementById('tripTitleDisplay').textContent = trip.title;
  document.getElementById('tripIdDisplay').textContent = `ID: ${trip.id}`;
  document.getElementById('tripDestinationDisplay').innerHTML = `
    <i data-lucide="map-pin" class="w-4 h-4 text-roseaccent-600"></i>
    <span>${escapeHtml(trip.destination || 'No destination specified')} • Currency: ${trip.currency || 'INR'}</span>
  `;

  // Status Pill
  const statusPill = document.getElementById('tripStatusPill');
  if (trip.status === 'ENDED') {
    statusPill.textContent = 'CONCLUDED / LOCKED';
    statusPill.className = 'text-xs px-3 py-1 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-300';
  } else {
    statusPill.textContent = 'ACTIVE';
    statusPill.className = 'text-xs px-3 py-1 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200';
  }

  // Mode Badge
  const modeBadge = document.getElementById('tripModeBadge');
  const tagClass = trip.mode === 'CORPORATE' ? 'tag-mode-corporate' : (trip.mode === 'HYBRID' ? 'tag-mode-hybrid' : 'tag-mode-social');
  modeBadge.className = `inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold ${tagClass}`;
  modeBadge.textContent = trip.mode === 'CORPORATE' ? 'Corporate Travel' : (trip.mode === 'HYBRID' ? 'Team Offsite' : 'Friends Outing');

  // Total spent & budget
  const spent = state.balances ? state.balances.totalTripSpent : 0;
  const budget = Number(trip.budget) || 0;
  const sym = trip.currencySymbol || '₹';
  document.getElementById('tripTotalSpentDisplay').textContent = `${sym}${spent.toLocaleString()}`;
  document.getElementById('tripBudgetDisplay').textContent = `${sym}${budget.toLocaleString()}`;

  // End Trip toggle button styling
  const btnToggle = document.getElementById('btnTripAdminToggleEndText');
  const iconToggle = document.getElementById('tripToggleEndIcon');
  if (trip.status === 'ENDED') {
    if (btnToggle) btnToggle.textContent = 'Reopen Trip';
    if (iconToggle) iconToggle.setAttribute('data-lucide', 'unlock');
  } else {
    if (btnToggle) btnToggle.textContent = 'End & Conclude Trip';
    if (iconToggle) iconToggle.setAttribute('data-lucide', 'lock');
  }

  // Update direct admin link display
  const shareUrl = getFullAdminUrl(trip.id);
  const shareDisplay = document.getElementById('adminShareUrlDisplay');
  if (shareDisplay) shareDisplay.textContent = shareUrl;

  // Back to user view button link
  const userViewLink = document.getElementById('btnBackToUserView');
  if (userViewLink) {
    userViewLink.href = `index.html?tripId=${encodeURIComponent(trip.id)}`;
  }

  // Badges in tabs
  const memberCount = (trip.members || []).length;
  document.getElementById('tabBadgeMemberCount').textContent = memberCount;
  document.getElementById('tabBadgeExpenseCount').textContent = state.expenses.length;

  // Hide or show Corporate tab
  const corpTabBtn = document.getElementById('tabBtnPolicy');
  if (trip.mode === 'CORPORATE' || trip.mode === 'HYBRID') {
    corpTabBtn.classList.remove('hidden');
  } else {
    corpTabBtn.classList.add('hidden');
    if (state.activeTab === 'policy') switchAdminTab('settings');
  }

  // Populate Tab views
  populateEditSettingsForm();
  renderMembersTab();
  renderExpensesTab();
  renderPolicyTab();
  renderAuditTab();

  if (window.lucide) lucide.createIcons();
}

// ==================== TAB 1: SETTINGS ====================
function populateEditSettingsForm() {
  const trip = state.currentTrip;
  if (!trip) return;

  document.getElementById('editTripTitle').value = trip.title || '';
  document.getElementById('editTripDestination').value = trip.destination || '';
  document.getElementById('editTripMode').value = trip.mode || 'SOCIAL';
  document.getElementById('editTripBudget').value = trip.budget || 0;
  document.getElementById('editTripDescription').value = trip.description || '';
}

async function handleSaveTripDetails(e) {
  e.preventDefault();
  if (!state.currentTrip) return;

  const payload = {
    title: document.getElementById('editTripTitle').value.trim(),
    destination: document.getElementById('editTripDestination').value.trim(),
    mode: document.getElementById('editTripMode').value,
    budget: Number(document.getElementById('editTripBudget').value) || 0,
    description: document.getElementById('editTripDescription').value.trim()
  };

  try {
    const updated = await api(`/trips/${state.currentTrip.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (updated) {
      state.currentTrip = updated;
      const idx = state.trips.findIndex(t => t.id === updated.id);
      if (idx !== -1) state.trips[idx] = updated;
      showToast('Trip parameters successfully updated!', 'success');
      renderTripSelector();
      renderTripWorkspace();
    }
  } catch (err) {
    showToast('Failed to save trip settings', 'error');
  }
}

// ==================== TAB 2: MEMBERS & ROLES ====================
function renderMembersTab() {
  const trip = state.currentTrip;
  if (!trip) return;

  const tbody = document.getElementById('tripMembersTableBody');
  const members = trip.members || [];

  if (members.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-6 text-center text-stone-400">
          No members currently enrolled. Click "Add Member to Trip" above.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = members.map((mid, idx) => {
    const u = state.users.find(user => user.id === mid) || {
      id: mid,
      name: mid,
      email: `${mid}@example.com`,
      phone: '',
      upiId: '',
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${mid}`
    };

    // First member is designated primary Trip Admin by default
    const isPrimaryAdmin = idx === 0;
    const isTripAdmin = isPrimaryAdmin || u.role === 'ADMIN' || (trip.adminIds && trip.adminIds.includes(u.id));

    return `
      <tr class="hover:bg-cream-50/60 transition">
        <td class="py-3 px-3">
          <div class="flex items-center gap-3">
            <img src="${u.avatar}" alt="${escapeHtml(u.name)}" class="w-8 h-8 rounded-full border border-cream-300 bg-cream-200 object-cover" />
            <div>
              <div class="font-bold text-stone-900">${escapeHtml(u.name)}</div>
              <div class="text-[11px] text-stone-400">${escapeHtml(u.email || u.id)}</div>
            </div>
          </div>
        </td>
        <td class="py-3 px-3">
          ${isTripAdmin ? `
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-roseaccent-100 text-roseaccent-800 border border-roseaccent-200">
              <i data-lucide="shield" class="w-3 h-3 text-roseaccent-600"></i>
              Trip Admin
            </span>
          ` : `
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cream-100 text-stone-600 border border-cream-300">
              Member
            </span>
          `}
        </td>
        <td class="py-3 px-3">
          <div class="flex items-center gap-1.5">
            ${u.phone ? `
              <a href="https://wa.me/${u.phone.replace(/[^0-9]/g, '')}" target="_blank" class="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1 transition" title="Open WhatsApp Chat">
                <i data-lucide="message-circle" class="w-3 h-3"></i>
                <span>WA</span>
              </a>
              <a href="tel:${u.phone}" class="px-2 py-1 rounded-lg text-[10px] font-bold bg-cream-100 text-stone-700 border border-cream-300 hover:bg-cream-200 flex items-center gap-1 transition" title="Call Member">
                <i data-lucide="phone" class="w-3 h-3"></i>
                <span>Call</span>
              </a>
            ` : '<span class="text-stone-300 text-[11px]">No Phone</span>'}
          </div>
        </td>
        <td class="py-3 px-3">
          ${u.upiId ? `
            <button onclick="window.copyText('${u.upiId}', 'UPI ID')" class="px-2 py-1 rounded-lg text-[10px] font-mono bg-cream-100 text-stone-700 border border-cream-300 hover:bg-cream-200 flex items-center gap-1 transition" title="Click to copy UPI">
              <i data-lucide="copy" class="w-3 h-3 text-stone-500"></i>
              <span>${escapeHtml(u.upiId)}</span>
            </button>
          ` : '<span class="text-stone-300 text-[11px]">No UPI</span>'}
        </td>
        <td class="py-3 px-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="window.toggleMemberAdminRole('${u.id}')" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-cream-300 text-stone-700 hover:bg-cream-100 transition shadow-xs">
              ${isTripAdmin ? 'Demote' : 'Promote Admin'}
            </button>
            <button onclick="window.removeMemberFromTrip('${u.id}')" class="px-2 py-1 rounded-lg text-[11px] font-semibold bg-roseaccent-50 border border-roseaccent-200 text-roseaccent-700 hover:bg-roseaccent-100 transition shadow-xs" title="Remove member from this trip">
              <i data-lucide="user-x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.toggleMemberAdminRole = async function(userId) {
  if (!state.currentTrip) return;
  const trip = state.currentTrip;
  if (!trip.adminIds) trip.adminIds = [trip.members[0]];

  const exists = trip.adminIds.includes(userId);
  if (exists) {
    if (trip.adminIds.length <= 1) {
      showToast('Cannot demote the sole administrator of this trip.', 'error');
      return;
    }
    trip.adminIds = trip.adminIds.filter(id => id !== userId);
    showToast('Member role demoted to Member.', 'info');
  } else {
    trip.adminIds.push(userId);
    showToast('Member promoted to Trip Administrator!', 'success');
  }

  await api(`/trips/${trip.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminIds: trip.adminIds })
  });

  renderMembersTab();
  if (window.lucide) lucide.createIcons();
};

window.removeMemberFromTrip = async function(userId) {
  if (!state.currentTrip) return;
  const trip = state.currentTrip;
  if (trip.members.length <= 1) {
    showToast('A trip must have at least one enrolled member.', 'error');
    return;
  }

  const u = state.users.find(user => user.id === userId);
  const name = u ? u.name : userId;

  if (!confirm(`Remove "${name}" from trip "${trip.title}"?`)) return;

  trip.members = trip.members.filter(id => id !== userId);
  if (trip.adminIds) trip.adminIds = trip.adminIds.filter(id => id !== userId);

  await api(`/trips/${trip.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ members: trip.members, adminIds: trip.adminIds })
  });

  showToast(`"${name}" removed from trip.`, 'info');
  renderTripWorkspace();
};

// ==================== TAB 3: EXPENSES OVERSIGHT ====================
function renderExpensesTab() {
  const tbody = document.getElementById('tripExpensesTableBody');
  const expenses = state.expenses || [];
  const search = (document.getElementById('expenseSearchInput').value || '').toLowerCase().trim();

  const filtered = expenses.filter(e => {
    if (!search) return true;
    const titleMatch = (e.title || '').toLowerCase().includes(search);
    const catMatch = (e.category || '').toLowerCase().includes(search);
    const payer = state.users.find(u => u.id === e.paidBy);
    const payerMatch = payer && payer.name.toLowerCase().includes(search);
    return titleMatch || catMatch || payerMatch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="py-6 text-center text-stone-400">
          No expenses found matching the criteria.
        </td>
      </tr>
    `;
    return;
  }

  const sym = (state.currentTrip && state.currentTrip.currencySymbol) || '₹';

  tbody.innerHTML = filtered.map(e => {
    const payer = state.users.find(u => u.id === e.paidBy);
    const payerName = payer ? payer.name : e.paidBy;
    const flags = e.policyFlags || [];

    return `
      <tr class="hover:bg-cream-50/60 transition">
        <td class="py-3 px-3 text-stone-500 font-mono text-[11px] whitespace-nowrap">${e.date || ''}</td>
        <td class="py-3 px-3">
          <div class="font-bold text-stone-900">${escapeHtml(e.title)}</div>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-cream-100 text-stone-600 font-semibold border border-cream-200">
            ${e.category || 'OTHER'}
          </span>
        </td>
        <td class="py-3 px-3 font-extrabold text-stone-900 whitespace-nowrap">${sym}${Number(e.amount).toLocaleString()}</td>
        <td class="py-3 px-3">
          <span class="font-semibold text-stone-700">${escapeHtml(payerName)}</span>
        </td>
        <td class="py-3 px-3">
          ${(e.receipt || e.receiptData) ? `
            <button onclick="window.viewReceiptPreview('${e.id}')" class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full hover:bg-emerald-100 transition" title="Inspect Receipt">
              <i data-lucide="paperclip" class="w-3 h-3"></i>
              <span>Receipt</span>
            </button>
          ` : '<span class="text-stone-300 text-[11px]">None</span>'}
        </td>
        <td class="py-3 px-3">
          ${e.location ? `
            <a href="https://www.google.com/maps?q=${e.location.lat},${e.location.lng}" target="_blank" class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full hover:bg-blue-100 transition" title="View GPS Pin on Google Maps">
              <i data-lucide="map-pin" class="w-3 h-3 text-blue-600"></i>
              <span>Map</span>
            </a>
          ` : '<span class="text-stone-300 text-[11px]">No GPS</span>'}
        </td>
        <td class="py-3 px-3">
          ${flags.length > 0 ? `
            <span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full" title="${flags.map(f => f.reason).join('; ')}">
              <i data-lucide="alert-triangle" class="w-3 h-3 text-amber-600"></i>
              <span>${flags.length} Flag</span>
            </span>
          ` : '<span class="text-emerald-700 text-[11px] font-semibold">✓ Compliant</span>'}
        </td>
        <td class="py-3 px-3 text-right">
          <button onclick="window.deleteExpenseAdmin('${e.id}')" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-roseaccent-50 border border-roseaccent-200 text-roseaccent-800 hover:bg-roseaccent-100 transition shadow-xs" title="Delete expense as Admin">
            <i data-lucide="trash-2" class="w-3.5 h-3.5 text-roseaccent-600"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.deleteExpenseAdmin = async function(expenseId) {
  const exp = state.expenses.find(e => e.id === expenseId);
  const title = exp ? exp.title : expenseId;

  if (!confirm(`Administrative Action: Permanently delete expense "${title}"?`)) return;

  try {
    await api(`/expenses/${expenseId}`, { method: 'DELETE' });
    state.expenses = state.expenses.filter(e => e.id !== expenseId);
    showToast(`Expense "${title}" deleted.`, 'info');
    
    // Refresh balances and UI
    if (state.currentTrip) {
      state.balances = await api(`/trips/${state.currentTrip.id}/balances`);
      renderTripWorkspace();
    }
  } catch (err) {
    showToast('Failed to delete expense', 'error');
  }
};

window.viewReceiptPreview = function(expenseId) {
  const exp = state.expenses.find(e => e.id === expenseId);
  if (!exp) return;

  const dataUrl = exp.receiptData || exp.receipt;
  document.getElementById('adminReceiptTitle').textContent = `Receipt for: ${exp.title} (₹${exp.amount})`;

  const img = document.getElementById('adminReceiptImage');
  const fallback = document.getElementById('adminReceiptFallback');

  if (dataUrl && dataUrl.startsWith('data:image/')) {
    img.src = dataUrl;
    img.classList.remove('hidden');
    fallback.classList.add('hidden');
  } else {
    img.classList.add('hidden');
    fallback.classList.remove('hidden');
    document.getElementById('adminReceiptFileName').textContent = exp.receipt || 'attachment.pdf';
    document.getElementById('adminReceiptDownloadLink').href = dataUrl || '#';
  }

  document.getElementById('modalAdminReceiptViewer').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
};

// ==================== TAB 4: CORPORATE & POLICY ====================
function renderPolicyTab() {
  const trip = state.currentTrip;
  if (!trip || !trip.corporateConfig) return;

  const cfg = trip.corporateConfig;
  document.getElementById('corpCostCenter').value = cfg.costCenter || 'CORP-GEN';
  document.getElementById('corpPerDiemLimit').value = cfg.perDiemLimit || 3000;
  document.getElementById('corpReceiptThreshold').value = cfg.receiptRequiredThreshold || 500;

  const statusBadge = document.getElementById('corpApprovalStatusBadge');
  statusBadge.textContent = cfg.approvalStatus || 'DRAFT';
  statusBadge.className = `text-xs px-2.5 py-0.5 rounded-full font-bold ${
    cfg.approvalStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
    cfg.approvalStatus === 'REJECTED' ? 'bg-roseaccent-100 text-roseaccent-800 border border-roseaccent-300' :
    'bg-amber-100 text-amber-800 border border-amber-300'
  }`;
}

async function handleSaveCorporatePolicy(e) {
  e.preventDefault();
  if (!state.currentTrip) return;

  const cfg = state.currentTrip.corporateConfig || {};
  cfg.costCenter = document.getElementById('corpCostCenter').value.trim();
  cfg.perDiemLimit = Number(document.getElementById('corpPerDiemLimit').value) || 3000;
  cfg.receiptRequiredThreshold = Number(document.getElementById('corpReceiptThreshold').value) || 500;

  try {
    const updated = await api(`/trips/${state.currentTrip.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ corporateConfig: cfg })
    });

    if (updated) {
      state.currentTrip = updated;
      showToast('Corporate policy & thresholds saved!', 'success');
      renderTripWorkspace();
    }
  } catch (err) {
    showToast('Failed to save policy settings', 'error');
  }
}

async function handleCorporateReportApproval(action) {
  if (!state.currentTrip) return;

  try {
    const res = await api(`/trips/${state.currentTrip.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });

    if (res && res.trip) {
      state.currentTrip = res.trip;
      showToast(`Trip report status updated to ${action === 'APPROVE' ? 'APPROVED' : 'REJECTED'}!`, 'info');
      renderTripWorkspace();
    }
  } catch (err) {
    showToast('Failed to update approval status', 'error');
  }
}

// ==================== TAB 5: AUDIT TRAIL ====================
function renderAuditTab() {
  const container = document.getElementById('tripAuditLogsContainer');
  const trip = state.currentTrip;
  if (!trip) return;

  const tripIdStr = trip.id;
  const tripTitle = trip.title.toLowerCase();

  // Filter logs relevant to this trip
  const relevant = (state.auditLogs || []).filter(l => {
    const details = (l.details || '').toLowerCase();
    return details.includes(tripIdStr.toLowerCase()) || details.includes(tripTitle);
  });

  if (relevant.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-stone-400 text-xs">
        No administrative changes logged for this trip yet.
      </div>
    `;
    return;
  }

  container.innerHTML = relevant.map(l => {
    const time = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = new Date(l.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });

    return `
      <div class="p-3 rounded-2xl bg-cream-50 border border-cream-200 flex items-center justify-between text-xs">
        <div class="flex items-center gap-2.5">
          <span class="w-2 h-2 rounded-full bg-roseaccent-600"></span>
          <div>
            <div class="font-bold text-stone-800">${escapeHtml(l.details)}</div>
            <div class="text-[10px] text-stone-400 font-mono">${escapeHtml(l.action)}</div>
          </div>
        </div>
        <div class="text-[11px] text-stone-400 font-mono shrink-0">${date} ${time}</div>
      </div>
    `;
  }).join('');
}

// ==================== SYSTEM OVERVIEW RENDERING ====================
function renderSystemOverview() {
  const stats = state.systemStats || {};
  document.getElementById('sysTotalTrips').textContent = stats.totalTrips || state.trips.length;
  document.getElementById('sysActiveTrips').textContent = stats.activeTrips || state.trips.filter(t => t.status !== 'ENDED').length;
  document.getElementById('sysEndedTrips').textContent = stats.endedTrips || state.trips.filter(t => t.status === 'ENDED').length;
  document.getElementById('sysTotalVolume').textContent = `₹${(stats.totalVolume || 0).toLocaleString()}`;

  // All Trips Table
  const tbodyTrips = document.getElementById('allTripsTableBody');
  tbodyTrips.innerHTML = state.trips.map(t => {
    return `
      <tr class="hover:bg-cream-50/60 transition">
        <td class="py-3 px-3 font-bold text-stone-900">
          <a href="admin.html?tripId=${t.id}" class="hover:text-roseaccent-700 underline decoration-roseaccent-300">
            ${escapeHtml(t.title)}
          </a>
          <div class="text-[10px] text-stone-400">${t.destination || 'No destination'}</div>
        </td>
        <td class="py-3 px-3">
          <span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-cream-100 text-stone-700 border border-cream-200">
            ${t.mode}
          </span>
        </td>
        <td class="py-3 px-3">
          <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${t.status === 'ENDED' ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
            ${t.status}
          </span>
        </td>
        <td class="py-3 px-3 font-semibold text-stone-600">${(t.members || []).length} members</td>
        <td class="py-3 px-3 font-extrabold text-stone-900">₹${(Number(t.budget) || 0).toLocaleString()}</td>
        <td class="py-3 px-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <a href="admin.html?tripId=${t.id}" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-cream-300 text-stone-700 hover:bg-cream-100 transition shadow-xs">
              Manage
            </a>
            <button onclick="window.handleSystemToggleEnd('${t.id}')" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cream-50 border border-cream-300 text-stone-700 hover:bg-cream-100 transition shadow-xs">
              ${t.status === 'ENDED' ? 'Reopen' : 'End'}
            </button>
            <button onclick="window.handleSystemDeleteTrip('${t.id}')" class="px-2 py-1 rounded-lg text-[11px] font-semibold bg-roseaccent-50 border border-roseaccent-200 text-roseaccent-800 hover:bg-roseaccent-100 transition shadow-xs">
              <i data-lucide="trash-2" class="w-3.5 h-3.5 text-roseaccent-600"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Global Users Table
  const tbodyUsers = document.getElementById('globalUsersTableBody');
  tbodyUsers.innerHTML = state.users.map(u => {
    return `
      <tr class="hover:bg-cream-50/60 transition">
        <td class="py-3 px-3">
          <div class="flex items-center gap-2.5">
            <img src="${u.avatar}" alt="${escapeHtml(u.name)}" class="w-7 h-7 rounded-full border border-cream-300 bg-cream-200 object-cover" />
            <span class="font-bold text-stone-900">${escapeHtml(u.name)}</span>
          </div>
        </td>
        <td class="py-3 px-3">
          <div class="text-stone-700">${escapeHtml(u.email || '-')}</div>
          <div class="text-[11px] text-stone-400 font-mono">${escapeHtml(u.phone || 'No phone')}</div>
        </td>
        <td class="py-3 px-3 font-mono text-stone-700">${escapeHtml(u.upiId || '-')}</td>
        <td class="py-3 px-3 font-semibold text-stone-600">${u.role || 'EMPLOYEE'}</td>
        <td class="py-3 px-3 text-right">
          <button onclick="window.handleDeleteUser('${u.id}')" class="px-2 py-1 rounded-lg text-[11px] font-semibold bg-roseaccent-50 border border-roseaccent-200 text-roseaccent-800 hover:bg-roseaccent-100 transition shadow-xs">
            <i data-lucide="trash-2" class="w-3.5 h-3.5 text-roseaccent-600"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

window.handleSystemToggleEnd = async function(tripId) {
  try {
    const updated = await api(`/trips/${tripId}/toggle-end`, { method: 'POST' });
    const idx = state.trips.findIndex(t => t.id === tripId);
    if (idx !== -1) state.trips[idx] = updated;
    showToast(`Trip "${updated.title}" status changed to ${updated.status}.`, 'info');
    selectSystemOverview();
  } catch (err) {
    showToast('Failed to toggle status', 'error');
  }
};

window.handleSystemDeleteTrip = async function(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!confirm(`Permanently delete trip "${trip ? trip.title : tripId}"?`)) return;

  try {
    await api(`/trips/${tripId}`, { method: 'DELETE' });
    state.trips = state.trips.filter(t => t.id !== tripId);
    showToast('Trip deleted permanently.', 'info');
    selectSystemOverview();
  } catch (err) {
    showToast('Failed to delete trip', 'error');
  }
};

window.handleDeleteUser = async function(userId) {
  const u = state.users.find(user => user.id === userId);
  if (!confirm(`Delete user "${u ? u.name : userId}"?`)) return;

  try {
    await api(`/users/${userId}`, { method: 'DELETE' });
    state.users = state.users.filter(user => user.id !== userId);
    showToast('User removed.', 'info');
    selectSystemOverview();
  } catch (err) {
    showToast('Failed to delete user', 'error');
  }
};

// ==================== SHARING & CLIPBOARD ====================
function getFullAdminUrl(tripId) {
  const loc = window.location;
  const path = loc.pathname.endsWith('/') ? `${loc.pathname}admin.html` : loc.pathname;
  return `${loc.origin}${path}?tripId=${encodeURIComponent(tripId)}`;
}

function getFullUserInviteUrl(tripId) {
  const loc = window.location;
  const path = loc.pathname.replace(/admin\.html$/, 'index.html');
  return `${loc.origin}${path}?tripId=${encodeURIComponent(tripId)}`;
}

window.copyAdminLink = function() {
  if (!state.currentTrip) {
    showToast('Select a trip first to share its admin URL.', 'info');
    return;
  }
  const url = getFullAdminUrl(state.currentTrip.id);
  window.copyText(url, 'Trip Admin Link');
};

window.copyUserInviteLink = function() {
  if (!state.currentTrip) return;
  const url = getFullUserInviteUrl(state.currentTrip.id);
  window.copyText(url, 'Member Invite Link');
};

window.copyText = function(text, label = 'Text') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`${label} copied to clipboard!`, 'success');
    }).catch(() => fallbackCopy(text, label));
  } else {
    fallbackCopy(text, label);
  }
};

function fallbackCopy(text, label) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast(`${label} copied to clipboard!`, 'success');
}

// ==================== EVENT LISTENERS SETUP ====================
function setupEventListeners() {
  // Trip selector dropdown
  document.getElementById('adminTripSelector').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === '__system__') {
      selectSystemOverview();
    } else {
      selectTrip(val);
    }
  });

  // Top header share button
  document.getElementById('btnHeaderShareAdmin').addEventListener('click', window.copyAdminLink);
  document.getElementById('btnCopyAdminUrl').addEventListener('click', window.copyAdminLink);
  document.getElementById('btnCopyUserInviteUrl').addEventListener('click', window.copyUserInviteLink);

  // Tab switching
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchAdminTab(tab);
    });
  });

  // Expense search input
  const expSearch = document.getElementById('expenseSearchInput');
  if (expSearch) expSearch.addEventListener('input', renderExpensesTab);

  // Trip Toggle End status
  const btnToggleEnd = document.getElementById('btnTripAdminToggleEnd');
  if (btnToggleEnd) {
    btnToggleEnd.addEventListener('click', async () => {
      if (!state.currentTrip) return;
      try {
        const updated = await api(`/trips/${state.currentTrip.id}/toggle-end`, { method: 'POST' });
        state.currentTrip = updated;
        const idx = state.trips.findIndex(t => t.id === updated.id);
        if (idx !== -1) state.trips[idx] = updated;
        showToast(`Trip "${updated.title}" is now ${updated.status}!`, 'info');
        renderTripWorkspace();
        renderTripSelector();
      } catch (e) {
        showToast('Failed to toggle trip status', 'error');
      }
    });
  }

  const btnSideToggle = document.getElementById('btnSideToggleEndTrip');
  if (btnSideToggle) {
    btnSideToggle.addEventListener('click', () => {
      document.getElementById('btnTripAdminToggleEnd').click();
    });
  }

  // Delete trip permanently
  const btnDeleteTrip = document.getElementById('btnAdminDeleteTrip');
  if (btnDeleteTrip) {
    btnDeleteTrip.addEventListener('click', async () => {
      if (!state.currentTrip) return;
      if (!confirm(`DANGER: Permanently delete trip "${state.currentTrip.title}" and all its expenses?`)) return;

      try {
        await api(`/trips/${state.currentTrip.id}`, { method: 'DELETE' });
        state.trips = state.trips.filter(t => t.id !== state.currentTrip.id);
        showToast('Trip permanently deleted.', 'info');
        if (state.trips.length > 0) {
          await selectTrip(state.trips[0].id);
        } else {
          selectSystemOverview();
        }
      } catch (e) {
        showToast('Failed to delete trip', 'error');
      }
    });
  }

  // Forms
  document.getElementById('formEditTripDetails').addEventListener('submit', handleSaveTripDetails);
  document.getElementById('formCorporatePolicy').addEventListener('submit', handleSaveCorporatePolicy);
  document.getElementById('btnAdminApproveReport').addEventListener('click', () => handleCorporateReportApproval('APPROVE'));
  document.getElementById('btnAdminRejectReport').addEventListener('click', () => handleCorporateReportApproval('REJECT'));

  // Add Member Modal
  const btnOpenAddMember = document.getElementById('btnOpenAddMemberModal');
  if (btnOpenAddMember) {
    btnOpenAddMember.addEventListener('click', () => {
      populateExistingUsersSelect();
      document.getElementById('modalAddMemberToTrip').classList.remove('hidden');
    });
  }

  document.getElementById('formAddMemberToTrip').addEventListener('submit', handleAddMemberToTrip);

  // Close Modals
  document.querySelectorAll('.close-admin-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('.modal-backdrop').classList.add('hidden');
    });
  });

  // Backup & Restore
  const btnExportBackup = document.getElementById('btnSysExportBackup');
  if (btnExportBackup) {
    btnExportBackup.addEventListener('click', async () => {
      try {
        let backupData = {};
        if (!isClientOnly) {
          backupData = await api('/admin/backup');
        } else {
          backupData = localDb.load();
        }
        const json = JSON.stringify(backupData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `omnivance_ledger_backup_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('JSON backup downloaded successfully!', 'success');
      } catch (err) {
        showToast('Failed to export backup', 'error');
      }
    });
  }

  const btnRestoreBackup = document.getElementById('btnSysRestoreBackup');
  const fileInput = document.getElementById('sysRestoreFileInput');
  if (btnRestoreBackup && fileInput) {
    btnRestoreBackup.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          if (isClientOnly) {
            localDb.save(parsed);
          } else {
            await api('/admin/restore', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(parsed)
            });
          }
          showToast('Database snapshot restored successfully!', 'success');
          setTimeout(() => window.location.reload(), 1000);
        } catch (err) {
          showToast('Invalid JSON backup file', 'error');
        }
      };
      reader.readAsText(file);
    });
  }
}

function switchAdminTab(tabId) {
  state.activeTab = tabId;

  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    if (btn.dataset.tab === tabId) {
      btn.classList.add('active', 'bg-white', 'text-stone-900', 'shadow-sm');
      btn.classList.remove('text-stone-600');
    } else {
      btn.classList.remove('active', 'bg-white', 'text-stone-900', 'shadow-sm');
      btn.classList.add('text-stone-600');
    }
  });

  document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));

  const activeContent = document.getElementById(`admin-tab-${tabId}`);
  if (activeContent) activeContent.classList.remove('hidden');

  if (tabId === 'members') renderMembersTab();
  if (tabId === 'expenses') renderExpensesTab();
  if (tabId === 'policy') renderPolicyTab();
  if (tabId === 'audit') renderAuditTab();

  if (window.lucide) lucide.createIcons();
}

function populateExistingUsersSelect() {
  const sel = document.getElementById('selectExistingUser');
  if (!sel) return;

  const currentMembers = (state.currentTrip && state.currentTrip.members) || [];
  const availableUsers = state.users.filter(u => !currentMembers.includes(u.id));

  sel.innerHTML = `
    <option value="">-- Choose from existing platform users (${availableUsers.length} available) --</option>
    ${availableUsers.map(u => `<option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.email || u.id)})</option>`).join('')}
  `;
}

async function handleAddMemberToTrip(e) {
  e.preventDefault();
  if (!state.currentTrip) return;

  const selectedUid = document.getElementById('selectExistingUser').value;
  const newName = document.getElementById('newMemberName').value.trim();
  const newPhone = document.getElementById('newMemberPhone').value.trim();
  const newUpi = document.getElementById('newMemberUpi').value.trim();
  const assignedRole = document.getElementById('newMemberRole').value;

  let memberIdToAdd = selectedUid;

  // If user entered a new name
  if (!memberIdToAdd && newName) {
    try {
      const createdUser = await api('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          phone: newPhone,
          upiId: newUpi,
          role: assignedRole === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE'
        })
      });

      if (createdUser) {
        memberIdToAdd = createdUser.id;
        state.users.push(createdUser);
      }
    } catch (err) {
      showToast('Failed to create new user', 'error');
      return;
    }
  }

  if (!memberIdToAdd) {
    showToast('Please select an existing user or enter a name to enroll.', 'error');
    return;
  }

  const trip = state.currentTrip;
  if (!trip.members.includes(memberIdToAdd)) {
    trip.members.push(memberIdToAdd);
  }

  if (assignedRole === 'ADMIN') {
    if (!trip.adminIds) trip.adminIds = [];
    if (!trip.adminIds.includes(memberIdToAdd)) trip.adminIds.push(memberIdToAdd);
  }

  try {
    const updated = await api(`/trips/${trip.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: trip.members, adminIds: trip.adminIds })
    });

    if (updated) {
      state.currentTrip = updated;
      showToast('Member enrolled into trip successfully!', 'success');
      document.getElementById('modalAddMemberToTrip').classList.add('hidden');
      document.getElementById('formAddMemberToTrip').reset();
      renderTripWorkspace();
    }
  } catch (err) {
    showToast('Failed to update trip members', 'error');
  }
}

// ==================== TOAST & ESCAPE HELPERS ====================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-600 text-white' : type === 'error' ? 'bg-red-600 text-white' : 'bg-stone-900 text-white';

  toast.className = `${bg} px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2 transform transition-all duration-300 translate-y-2 opacity-0 pointer-events-auto`;
  toast.innerHTML = `
    <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info'}" class="w-4 h-4"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
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
