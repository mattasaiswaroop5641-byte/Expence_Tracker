const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/db');
const settlementService = require('../services/settlementService');
const policyService = require('../services/policyService');

const router = express.Router();

// --- Health ---
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Omnivance Expense Engine', timestamp: new Date() });
});

// --- Users ---
router.get('/users', (req, res) => {
  res.json(db.getUsers());
});

router.post('/users', (req, res) => {
  const { name, email, upiId, phone, role } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required' });
  }

  const id = `u_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`;
  const newUser = {
    id,
    name: name.trim(),
    email: email || `${id}@example.com`,
    phone: phone ? phone.trim() : '',
    avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(name)}`,
    upiId: upiId || '',
    role: role || 'EMPLOYEE'
  };

  db.addUser(newUser);
  db.addAuditLog('USER_CREATED', `User "${newUser.name}" (${newUser.role}) added`);
  res.status(201).json(newUser);
});

router.put('/users/:id', (req, res) => {
  const { name, email, upiId, phone, role } = req.body;
  const existing = db.getUserById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (email !== undefined) updates.email = email.trim();
  if (upiId !== undefined) updates.upiId = upiId.trim();
  if (phone !== undefined) updates.phone = phone.trim();
  if (role !== undefined) updates.role = role.trim();

  const updated = db.updateUser(req.params.id, updates);
  db.addAuditLog('USER_UPDATED', `User "${updated.name}" updated`);
  res.json(updated);
});

router.delete('/users/:id', (req, res) => {
  const existing = db.getUserById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  db.deleteUser(req.params.id);
  db.addAuditLog('USER_DELETED', `User "${existing.name}" removed`);
  res.json({ success: true, message: 'User deleted' });
});

// --- Trips ---
router.get('/trips', (req, res) => {
  const { mode } = req.query;
  let trips = db.getTrips();
  if (mode) {
    trips = trips.filter(t => t.mode === mode.toUpperCase());
  }
  res.json(trips);
});

router.post('/reset', (req, res) => {
  db.saveDb({
    users: [],
    trips: [],
    expenses: [],
    settlements: []
  });
  db.resetCache();
  res.json({ message: 'Database reset to empty clean state' });
});

router.post('/trips', (req, res) => {
  const {
    title,
    mode,
    currency,
    currencySymbol,
    destination,
    description,
    members,
    memberNames,
    budget,
    corporateConfig
  } = req.body;

  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Trip title is required' });
  }

  let finalMemberIds = [];

  // If friendly member names are provided (e.g. from the New Trip form input)
  if (Array.isArray(memberNames) && memberNames.length > 0) {
    memberNames.forEach(rawName => {
      const name = String(rawName).trim();
      if (!name) return;
      let existing = db.getUsers().find(u => u.name.toLowerCase() === name.toLowerCase());
      if (!existing) {
        const uid = `u_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`;
        existing = db.addUser({
          id: uid,
          name,
          email: `${name.toLowerCase()}@example.com`,
          avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(name)}`,
          upiId: '',
          role: 'EMPLOYEE'
        });
      }
      if (!finalMemberIds.includes(existing.id)) {
        finalMemberIds.push(existing.id);
      }
    });
  } else if (Array.isArray(members) && members.length > 0) {
    finalMemberIds = members;
  }

  const tripMode = (mode || 'SOCIAL').toUpperCase();
  const id = `trip_${Date.now()}`;

  const newTrip = {
    id,
    title: title.trim(),
    mode: tripMode,
    currency: currency || 'INR',
    currencySymbol: currencySymbol || (currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₹'),
    destination: destination || '',
    description: description || '',
    members: finalMemberIds,
    createdAt: new Date().toISOString(),
    status: 'ACTIVE',
    budget: Number(budget) || 0,
    corporateConfig: (tripMode === 'CORPORATE' || tripMode === 'HYBRID') ? {
      costCenter: (corporateConfig && corporateConfig.costCenter) || 'CORP-GEN-2026',
      perDiemLimit: Number(corporateConfig && corporateConfig.perDiemLimit) || 3000,
      receiptRequiredThreshold: Number(corporateConfig && corporateConfig.receiptRequiredThreshold) || 500,
      approverId: (corporateConfig && corporateConfig.approverId) || (finalMemberIds[0] || 'u_admin'),
      approvalStatus: 'DRAFT',
      approvedAt: null,
      rejectionReason: null
    } : null
  };

  db.createTrip(newTrip);
  db.addAuditLog('TRIP_CREATED', `Trip "${newTrip.title}" (${newTrip.mode}) created`);
  res.status(201).json(newTrip);
});

router.get('/trips/:id', (req, res) => {
  const trip = db.getTripById(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

router.put('/trips/:id', (req, res) => {
  const updated = db.updateTrip(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Trip not found' });
  res.json(updated);
});

router.delete('/trips/:id', (req, res) => {
  const existing = db.getTripById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Trip not found' });
  db.deleteTrip(req.params.id);
  db.addAuditLog('TRIP_DELETED', `Trip "${existing.title}" deleted`);
  res.json({ success: true, message: 'Trip deleted' });
});

router.post('/trips/:id/toggle-end', (req, res) => {
  const trip = db.getTripById(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const nextStatus = trip.status === 'ENDED' ? 'ACTIVE' : 'ENDED';
  const updated = db.updateTrip(trip.id, {
    status: nextStatus,
    endedAt: nextStatus === 'ENDED' ? new Date().toISOString() : null
  });
  db.addAuditLog('TRIP_STATUS_CHANGE', `Trip "${trip.title}" status changed to ${nextStatus}`);
  res.json(updated);
});

// --- Expenses ---
router.get('/expenses', (req, res) => {
  const { tripId } = req.query;
  if (tripId) {
    return res.json(db.getExpensesByTrip(tripId));
  }
  res.json(db.getAllExpenses());
});

router.get('/trips/:id/expenses', (req, res) => {
  const expenses = db.getExpensesByTrip(req.params.id);
  res.json(expenses);
});

router.post('/trips/:id/expenses', (req, res) => {
  const trip = db.getTripById(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  if (trip.status === 'ENDED') {
    return res.status(400).json({ error: 'This trip is closed/ended. Reopen the trip in order to record new expenses.' });
  }

  const {
    title,
    amount,
    category,
    paidBy,
    date,
    splitType,
    splits,
    receipt,
    receiptData,
    location,
    notes,
    isReimbursable
  } = req.body;

  const parsedAmount = Number(amount);
  if (!title || isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Valid title and positive amount are required' });
  }

  if (!paidBy) {
    return res.status(400).json({ error: 'Payer (paidBy) is required' });
  }

  // Calculate splits
  let finalSplits = [];
  const type = splitType || 'EQUAL';

  if (type === 'EQUAL') {
    // If specific members provided in splits, use them; otherwise use all trip members
    const targetMembers = (Array.isArray(splits) && splits.length > 0)
      ? splits.map(s => (typeof s === 'string' ? s : s.userId))
      : trip.members;

    const count = targetMembers.length || 1;
    const share = Math.round((parsedAmount / count) * 100) / 100;
    
    // Distribute rounding difference to the first person
    let remainder = Math.round((parsedAmount - (share * count)) * 100) / 100;

    finalSplits = targetMembers.map((userId, index) => ({
      userId,
      amount: index === 0 ? Math.round((share + remainder) * 100) / 100 : share
    }));
  } else {
    // Exact splits provided
    finalSplits = splits.map(s => ({
      userId: s.userId,
      amount: Number(s.amount) || 0
    }));
  }

  const newExpense = {
    id: `exp_${uuidv4().slice(0, 8)}`,
    tripId: trip.id,
    title: title.trim(),
    amount: parsedAmount,
    currency: trip.currency,
    date: date || new Date().toISOString().split('T')[0],
    category: category || 'OTHER',
    paidBy,
    splitType: type,
    splits: finalSplits,
    isReimbursable: Boolean(isReimbursable || trip.mode === 'CORPORATE'),
    receipt: receipt || null,
    receiptData: receiptData || receipt || null,
    location: location || null,
    notes: notes || '',
    policyFlags: []
  };

  // Run Corporate Policy Engine check
  newExpense.policyFlags = policyService.evaluatePolicy(newExpense, trip);

  db.addExpense(newExpense);
  db.addAuditLog('EXPENSE_ADDED', `Expense "${newExpense.title}" (${trip.currencySymbol}${newExpense.amount}) added to trip "${trip.title}"`);
  res.status(201).json(newExpense);
});

router.delete('/expenses/:id', (req, res) => {
  const existing = db.getExpenseById(req.params.id);
  const success = db.deleteExpense(req.params.id);
  if (!success) return res.status(404).json({ error: 'Expense not found' });
  db.addAuditLog('EXPENSE_DELETED', `Expense "${existing ? existing.title : req.params.id}" removed`);
  res.json({ success: true, message: 'Expense deleted' });
});

// --- Balances & Settlement ---
router.get('/trips/:id/balances', (req, res) => {
  const balanceData = settlementService.calculateBalances(req.params.id);
  if (!balanceData) return res.status(404).json({ error: 'Trip not found' });
  res.json(balanceData);
});

router.post('/trips/:id/settle', (req, res) => {
  const trip = db.getTripById(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  const { fromUser, toUser, amount, reference } = req.body;
  if (!fromUser || !toUser || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'fromUser, toUser, and valid positive amount are required' });
  }

  const settlement = {
    id: `stl_${uuidv4().slice(0, 8)}`,
    tripId: trip.id,
    fromUser,
    toUser,
    amount: Number(amount),
    date: new Date().toISOString(),
    reference: reference || 'Manual Settle'
  };

  db.addSettlement(settlement);

  // Return refreshed balances
  const updatedBalances = settlementService.calculateBalances(trip.id);
  res.status(201).json({ settlement, updatedBalances });
});

// --- Corporate Approvals ---
router.post('/trips/:id/approve', (req, res) => {
  const trip = db.getTripById(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  const { action, approverId, rejectionReason } = req.body; // action: 'SUBMIT' | 'APPROVE' | 'REJECT'

  if (!trip.corporateConfig) {
    return res.status(400).json({ error: 'Trip is not in Corporate or Hybrid mode' });
  }

  const currentConfig = trip.corporateConfig;

  if (action === 'SUBMIT') {
    currentConfig.approvalStatus = 'PENDING';
  } else if (action === 'APPROVE') {
    currentConfig.approvalStatus = 'APPROVED';
    currentConfig.approvedAt = new Date().toISOString();
    currentConfig.approverId = approverId || currentConfig.approverId;
  } else if (action === 'REJECT') {
    currentConfig.approvalStatus = 'REJECTED';
    currentConfig.rejectionReason = rejectionReason || 'Policy non-compliance or incomplete receipts.';
  } else {
    return res.status(400).json({ error: 'Invalid action. Choose SUBMIT, APPROVE, or REJECT.' });
  }

  db.updateTrip(trip.id, { corporateConfig: currentConfig });
  res.json({ message: `Trip status updated to ${currentConfig.approvalStatus}`, trip });
});

// --- Export Summary (CSV / JSON) ---
router.get('/trips/:id/export', (req, res) => {
  const trip = db.getTripById(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  const expenses = db.getExpensesByTrip(trip.id);
  const balances = settlementService.calculateBalances(trip.id);
  const users = db.getUsers();
  const getUserName = (id) => (users.find(u => u.id === id) || {}).name || id;

  if (req.query.format === 'csv') {
    let csv = `Date,Expense ID,Title,Category,Amount (${trip.currency}),Paid By,Splits,Policy Flags,Receipt\n`;
    expenses.forEach(e => {
      const splitsStr = e.splits.map(s => `${getUserName(s.userId)}:${s.amount}`).join('; ');
      const flagsStr = (e.policyFlags || []).map(f => f.code).join('; ');
      csv += `"${e.date}","${e.id}","${e.title.replace(/"/g, '""')}","${e.category}",${e.amount},"${getUserName(e.paidBy)}","${splitsStr}","${flagsStr}","${e.receipt || 'None'}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${trip.title.replace(/[^a-zA-Z0-9]/g, '_')}_expenses.csv"`);
    return res.send(csv);
  }

  res.json({
    trip,
    balances,
    expenses
  });
});

// --- Admin Routes ---
router.get('/admin/stats', (req, res) => {
  const trips = db.getTrips();
  const users = db.getUsers();
  const expenses = db.getAllExpenses();
  const settlements = (db.getDb().settlements || []);
  const totalVolume = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const activeTrips = trips.filter(t => t.status !== 'ENDED').length;
  const endedTrips = trips.filter(t => t.status === 'ENDED').length;

  res.json({
    totalTrips: trips.length,
    activeTrips,
    endedTrips,
    totalUsers: users.length,
    totalExpenses: expenses.length,
    totalVolume: Math.round(totalVolume * 100) / 100,
    totalSettlements: settlements.length
  });
});

router.get('/admin/audit-logs', (req, res) => {
  res.json(db.getAuditLogs());
});

router.get('/admin/settings', (req, res) => {
  res.json(db.getSettings());
});

router.post('/admin/settings', (req, res) => {
  const { defaultPerDiemLimit, defaultReceiptRequiredThreshold, currency, currencySymbol } = req.body;
  const updates = {};
  if (defaultPerDiemLimit !== undefined) updates.defaultPerDiemLimit = Number(defaultPerDiemLimit);
  if (defaultReceiptRequiredThreshold !== undefined) updates.defaultReceiptRequiredThreshold = Number(defaultReceiptRequiredThreshold);
  if (currency !== undefined) updates.currency = currency;
  if (currencySymbol !== undefined) updates.currencySymbol = currencySymbol;

  const saved = db.updateSettings(updates);
  db.addAuditLog('SETTINGS_UPDATED', `Corporate settings updated`);
  res.json(saved);
});

router.get('/admin/backup', (req, res) => {
  const fullData = db.getDb();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="expense_tracker_backup_${Date.now()}.json"`);
  res.json(fullData);
});

router.post('/admin/restore', (req, res) => {
  const { data } = req.body;
  if (!data || !Array.isArray(data.users) || !Array.isArray(data.trips)) {
    return res.status(400).json({ error: 'Invalid backup file schema: must contain users and trips arrays' });
  }
  db.saveDb(data);
  db.resetCache();
  db.addAuditLog('DATABASE_RESTORED', `Database restored from backup: ${data.trips.length} trips, ${data.users.length} users`);
  res.json({ success: true, message: 'Database successfully restored from backup' });
});

module.exports = router;
