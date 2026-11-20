# Product Requirements Document (PRD): Omnivance Expense Tracker
*Unified Expense Management from Friends' Groups to Corporate Travel*

---

## 1. Project Overview

**Omnivance Expense Tracker** is an adaptive, lightweight web application designed to track and settle group expenses across the full spectrum of travel—from a casual weekend getaway among friends to policy-compliant corporate business trips. It combines instant equal/custom peer-to-peer debt splitting with corporate travel governance (per-diem limits, mandatory receipt tracking, cost center allocation, and manager approval workflows).

---

## 2. Target Users

1. **Friends & Flatmates (Social Users)**: Groups of friends, flatmates, or road-trippers who need a 3-tap way to record who paid, split bills fairly, and settle debts with minimum transactions.
2. **Business Travelers & Employees**: Employees traveling for conferences, client meetings, or company offsites who need to record expenses, attach receipts, ensure per-diem compliance, and submit claims for reimbursement.
3. **Approving Managers & Finance Leads**: Team leads and finance administrators who review travel claims, verify compliance with spending policies, and approve expense reports.

---

## 3. Problem Statement

Existing solutions are fragmented:
- **Casual Split Apps (Splitwise, Tricount)**: Excellent for casual peer splitting, but completely lack corporate compliance, per-diem limits, receipt audit thresholds, cost center tagging, and formal manager approval chains.
- **Enterprise Expense Tools (SAP Concur, Expensify)**: Heavy, rigid, expensive, and unusable for a casual weekend outing or dinner among friends.
- **Team Offsites / Bleisure Gap**: When coworkers travel together, they often face both needs—company-reimbursed flights and hotels alongside shared casual dinners and cabs split among colleagues.

Omnivance solves this with a **progressive mode engine**: users select **Friends Trip (Social)**, **Team Offsite (Hybrid)**, or **Corporate Travel**, and the UI dynamically adapts to provide only the controls needed.

---

## 4. Key Features (In Scope)

1. **Trip & Workspace Management**:
   - Create trips with title, destination, currency, budget, and participants.
   - Select Trip Mode: `Friends Trip (Social)`, `Team Offsite (Hybrid)`, or `Corporate Travel`.
   - Dynamic UI adaptation based on selected mode.

2. **Expense Logging & Splitting**:
   - Record expenses with title, amount, date, category (Food, Stay, Travel, Activities, Other), and payer.
   - Flexible splits: Equal split with member selection or exact shares.
   - Live share calculator showing real-time cost per person.
   - Receipt attachment tracking (mandatory for corporate claims over threshold).

3. **Balances & Minimum-Debt Settlement**:
   - Live net ledger calculation (who paid vs. fair share owed).
   - **Greedy Graph Debt Simplification Algorithm**: Reduces $N(N-1)/2$ complex inter-member debts down to at most $N-1$ direct transfers.
   - 1-click UPI / digital payment deep-links and manual "Mark as Paid" settlement recording.

4. **Corporate Travel Policy & Compliance Engine**:
   - Automated rule checks against company travel policies:
     - **Per-Diem Allowance Check**: Flags daily food/meal expenses that exceed daily per-person caps (e.g. ₹3,000/day).
     - **Mandatory Receipt Threshold**: Flags business expenses exceeding the threshold (e.g. ≥ ₹500) missing receipts.
     - **High Value Alert**: Warns if a single expense exceeds 50% of the total trip budget.

5. **Manager Review & Approval Workflow**:
   - Multi-stage approval pipeline: `DRAFT` ➔ `PENDING` ➔ `APPROVED` / `REJECTED`.
   - Manager action bar to approve expense reports or send back with feedback.

6. **Audit & Reporting**:
   - One-click CSV export containing full expense ledger, split details, policy check flags, and receipts.
   - Real-time budget utilization progress bar.

---

## 5. Out of Scope (For Local Prototype)

To maintain high development velocity and zero-setup local execution for Phase 1:
- Live external banking / credit card API feeds (settlements are recorded via UPI links and local logging).
- Paid cloud OCR services (simulated local receipt metadata attachment is provided).
- Complex multi-currency live forex conversions (all calculations use trip base currency).
- Multi-tenant enterprise SSO (uses clean local profile selection).

---

## 6. Proposed Tech Stack

- **Frontend**: Lightweight Reactive SPA with Tailwind CSS & Google Fonts (`Plus Jakarta Sans`), Lucide Icons.
- **Backend**: Node.js with Express.js REST API.
- **Database**: Atomic Local JSON Storage Engine (`server/data/db.json`) with in-memory caching and thread-safe file writes.
- **Hosting / Runtime**: Localhost (`http://localhost:5000`) for development and instant demo.

---

## 7. Acceptance Criteria

The system is complete when:
- [x] A user can create a trip in **Friends Trip** or **Corporate Travel** mode with custom members.
- [x] Adding an expense calculates each member's split and updates the trip's total spend.
- [x] Balances tab accurately calculates net balances and provides minimum debt transfers.
- [x] In Corporate mode, expenses exceeding the per-diem cap or missing mandatory receipts trigger visual policy violation badges.
- [x] The approving manager can click "Approve Expense Report" to transition the report to `APPROVED`.
- [x] The entire ledger can be exported as a structured CSV audit file.
- [x] Automated unit and integration tests run with 100% pass rate via `npm test`.
