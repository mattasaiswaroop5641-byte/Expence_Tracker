# Technical Specification: Omnivance Expense Tracker
*Lightweight, Adaptive Expense Ledger for Friends' Trips & Corporate Travel*

---

## 1. System Architecture

Omnivance Ledger is structured as a clean client-server web application designed to run locally with zero external database configuration.

```text
+------------------------------------------------------------------------+
|                          Client (Browser)                              |
|  - Reactive Vanilla / ES6 Single Page App (SPA)                       |
|  - Styling: Tailwind CSS (Cream #FAF7F2 & Blush Red #FFF1F2 Palette)   |
|  - Dynamic Modes: Friends Trip (Social) | Corporate Travel             |
+------------------------------------------------------------------------+
                                   |
                          HTTP / REST API (JSON)
                                   |
                                   v
+------------------------------------------------------------------------+
|                      Backend (Node.js / Express)                       |
|                                                                        |
|  +------------------+  +-------------------+  +---------------------+  |
|  | Trips API        |  | Expenses & Splits |  | Policy Rules Engine |  |
|  | /api/trips       |  | /api/expenses     |  | (Per Diem / Receipt)|  |
|  +------------------+  +-------------------+  +---------------------+  |
|  +------------------+  +-------------------+  +---------------------+  |
|  | Settle Engine    |  | Corporate Approval|  | Static UI Server    |  |
|  | (Min Debt Graph) |  | /api/trips/:id/app|  | / (index.html, JS)  |  |
|  +------------------+  +-------------------+  +---------------------+  |
|                                  |                                     |
|                       JSON Data Access Layer                           |
|               (Atomic File Writes & In-Memory Cache)                   |
+----------------------------------|-------------------------------------+
                                   |
                                   v
+------------------------------------------------------------------------+
|                         Local JSON Database                            |
|             server/data/db.json (trips, users, expenses)               |
+------------------------------------------------------------------------+
```

### Architectural Highlights
- **Single-Command Local Execution**: The Node.js Express server delivers both the REST API and the static web assets from `server/public/` on `http://localhost:5000`.
- **Atomic JSON Storage**: All modifications perform in-memory updates followed by an atomic write to a `.tmp` file and rename, preventing data corruption.
- **Progressive UI Disclosure**: The UI exposes friends-only features (instant equal splits, UPI links) or corporate controls (per-diem limits, manager approval actions) based on the trip's mode.

---

## 2. Recommended Folder Structure

```text
Expence tracker/
├── docs/                        # Project Specifications & SDLC Documentation
│   ├── PRD.md                   # Product Requirements Document
│   ├── TECH_SPEC.md             # This Technical Specification
│   ├── PROTOTYPE.md             # Prototype Runbook & Feature Checklist
│   └── PRD_UNIFIED_EXPENSE_TRACKER.md # Enterprise Reference PRD
├── skills/                      # SDLC Skills & Templates
│   ├── prd/SKILL.md             # PRD Guidelines
│   ├── tech-spec/SKILL.md       # Tech Spec Guidelines
│   ├── prototype/SKILL.md       # Prototype Prototyping Guidelines
│   └── development/SKILL.md     # Development & Verification Guidelines
├── server/                      # Node.js Application
│   ├── data/
│   │   └── db.json              # Local JSON Database
│   ├── public/                  # Frontend UI Assets
│   │   ├── index.html           # Main SPA HTML structure
│   │   ├── app.js               # Reactive Client Logic & State
│   │   └── style.css            # Cream & Soft Red Design System
│   ├── src/
│   │   ├── routes/
│   │   │   └── api.js           # Express REST API routes
│   │   ├── services/
│   │   │   ├── db.js            # Thread-safe JSON DAL
│   │   │   ├── settlementService.js # Debt Simplification Engine
│   │   │   └── policyService.js # Corporate Compliance Engine
│   │   └── server.js            # Express Entrypoint
│   ├── test/
│   │   └── api.test.js          # Unit & Integration Test Suite
│   └── package.json             # Node dependencies and scripts
└── README.md                    # Project Runbook & Documentation
```

---

## 3. Database Schema (Data Models)

The database resides in `server/data/db.json` with four top-level collections:

### 3.1 `users` Collection
Represents participants (friends, employees, or managers).
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Primary key (e.g. `u_alex_1234`). |
| `name` | `string` | Full name. |
| `email` | `string` | User email address. |
| `avatar` | `string` | DiceBear avatar URL. |
| `upiId` | `string` | UPI ID for digital payments (optional). |
| `role` | `string` | `'EMPLOYEE'` or `'MANAGER'`. |

### 3.2 `trips` Collection
Represents an expense workspace.
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Primary key (e.g. `trip_1732080000`). |
| `title` | `string` | Trip title. |
| `mode` | `string` | `'SOCIAL'` (Friends) \| `'HYBRID'` \| `'CORPORATE'`. |
| `currency` | `string` | Base currency code (default: `'INR'`). |
| `currencySymbol` | `string` | Symbol (e.g. `'₹'`). |
| `destination` | `string` | City / Country. |
| `members` | `string[]` | Array of user IDs enrolled in the trip. |
| `budget` | `number` | Budget limit. |
| `status` | `string` | `'ACTIVE'` \| `'SETTLED'`. |
| `corporateConfig`| `object \| null` | Corporate rules (`costCenter`, `perDiemLimit`, `receiptRequiredThreshold`, `approvalStatus`). |

### 3.3 `expenses` Collection
Represents individual transactions.
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Primary key (e.g. `exp_9a12c8`). |
| `tripId` | `string` | Foreign key referencing `trips.id`. |
| `title` | `string` | Description of expense. |
| `amount` | `number` | Monetary amount. |
| `category` | `string` | `'FOOD'` \| `'STAY'` \| `'TRAVEL'` \| `'ACTIVITIES'` \| `'OTHER'`. |
| `paidBy` | `string` | User ID of the payer. |
| `splitType` | `string` | `'EQUAL'` \| `'EXACT'`. |
| `splits` | `array` | Objects: `[{ userId: string, amount: number }]`. |
| `receipt` | `string \| null`| Attached receipt filename. |
| `policyFlags` | `array` | Automated violation tags: `[{ code, severity, message }]`. |

### 3.4 `settlements` Collection
Represents recorded debt repayments.
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Primary key. |
| `tripId` | `string` | Foreign key referencing `trips.id`. |
| `fromUser` | `string` | Payer user ID. |
| `toUser` | `string` | Receiver user ID. |
| `amount` | `number` | Amount paid. |
| `date` | `string` | ISO timestamp. |
| `reference` | `string` | Notes (e.g. "Paid via UPI"). |

---

## 4. API Endpoints (Contracts)

| Method | Endpoint | Request Body | Response Status & Payload |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | None | `200 OK` `{ status: "ok", timestamp }` |
| `GET` | `/api/users` | None | `200 OK` `User[]` |
| `POST` | `/api/users` | `{ name, email, upiId, role }` | `201 Created` `User` |
| `GET` | `/api/trips` | None (Optional `?mode=SOCIAL`) | `200 OK` `Trip[]` |
| `POST` | `/api/trips` | `{ title, mode, memberNames, budget, destination, corporateConfig }` | `201 Created` `Trip` |
| `GET` | `/api/trips/:id` | None | `200 OK` `Trip` |
| `GET` | `/api/trips/:id/expenses` | None | `200 OK` `Expense[]` |
| `POST` | `/api/trips/:id/expenses` | `{ title, amount, category, paidBy, date, splitType, splits, receipt }` | `201 Created` `Expense` (with evaluated policyFlags) |
| `DELETE` | `/api/expenses/:id` | None | `200 OK` `{ success: true }` |
| `GET` | `/api/trips/:id/balances` | None | `200 OK` `{ totalTripSpent, membersSummary, simplifiedTransfers }` |
| `POST` | `/api/trips/:id/settle` | `{ fromUser, toUser, amount, reference }` | `201 Created` `{ settlement, updatedBalances }` |
| `POST` | `/api/trips/:id/approve` | `{ action: "APPROVE" \| "REJECT", approverId }` | `200 OK` `{ trip, message }` |
| `GET` | `/api/trips/:id/export` | Optional `?format=csv` | `200 OK` (CSV file or JSON audit object) |
| `POST` | `/api/reset` | None | `200 OK` `{ message: "Database reset to empty clean state" }` |

---

## 5. Frontend Component Hierarchy

The single page application is organized modularly:

- **Top Navigation Bar (`header`)**:
  - `Brand & Logo`: Omnivance Ledger identity.
  - `TripSelector`: Dropdown to switch between active trips.
  - `TripModeBadge`: Soft pill indicating `Friends Trip` vs. `Corporate Travel`.
  - `HeaderCTAs`: Quick access buttons for "New Trip" and "Add Expense".
- **Dashboard Overview (`#activeTripDashboard`)**:
  - `TotalSpendCard`: Total amount spent with animated budget utilization progress bar.
  - `YourBalanceCard`: Net position indicator ("You are owed ₹X" or "You owe ₹Y").
  - `MembersCard`: Member count and avatar stack.
  - `GuardCard`: Corporate policy status or social debt overview.
- **Tab Navigation & Views**:
  - `Tab 1: Expenses Ledger`: Filterable list of expenses with category badges, split breakdowns, and policy warning pills.
  - `Tab 2: Balances & Settle Up`: Member ledger breakdown, debt simplification cards with 1-click UPI links and "Mark Paid" buttons.
  - `Tab 3: Corporate Compliance`: Per-diem trackers, cost center metadata, audit violation alerts, and manager "Approve Report" button.
  - `Tab 4: Trip Members`: Member profile cards with individual total spend vs. fair share owed.
  - `Tab 5: All Expenses Tracker`: End-of-trip itemized master audit, category spend distribution bar, running cumulative timeline, search filter, and final member settlement reconciliation.
- **Interactive Modals**:
  - `AddExpenseModal`: Split calculator with live estimated share per person.
  - `NewTripModal`: Mode toggle with dynamic corporate compliance inputs.
  - `SettlePaymentModal`: Payer/receiver settlement recording form.
  - `AddMemberModal`: Friend enrollment form.
- **Notification System (`#toastContainer`)**: Non-blocking toast notifications for user actions.

---

## 6. Basic Security & Data Validation

1. **Input Validation**:
   - Expense titles must be non-empty strings.
   - Expense amounts must be positive numbers (`amount > 0`).
   - Every expense requires a valid `paidBy` user ID.
   - Payer and Receiver in settlements must be different individuals.
2. **Atomic Integrity**:
   - All writes to `db.json` use `.tmp` files with atomic file renames to guarantee zero file truncation or corrupted states.
3. **Floating Point Rounding Protection**:
   - Currency shares are explicitly rounded to 2 decimal places (`Math.round(val * 100) / 100`).
   - Rounding remainders are attributed to the primary payer so that $\sum \text{Splits} \equiv \text{Total Amount}$.

---

## 7. Implementation Checklist & Progress

- [x] **Project Scaffolding**: Node.js, Express, CORS, and file structure initialized.
- [x] **JSON Storage Engine**: Thread-safe atomic file writer with clean schema (`server/src/services/db.js`).
- [x] **Debt Simplification Algorithm**: Min-cost greedy graph debt reduction implemented (`server/src/services/settlementService.js`).
- [x] **Corporate Policy Engine**: Per-diem checks and mandatory receipt threshold verification (`server/src/services/policyService.js`).
- [x] **REST API Routes**: Full endpoints for trips, expenses, balances, approvals, and CSV exports (`server/src/routes/api.js`).
- [x] **Sleek Web UI**: Responsive single-page application with Cream (`#FAF7F2`) and Blush Red (`#FFF1F2`) palette.
- [x] **Automated Test Suite**: Unit and integration tests passing cleanly (`npm test`).
- [x] **Documentation & SDLC Alignment**: PRD, Tech Spec, and Prototype guide aligned with skills framework.
