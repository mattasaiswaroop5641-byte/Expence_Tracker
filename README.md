# Omnivance Ledger — Unified Expense Tracker
*From Casual Friends' Outings to Enterprise Corporate Travel*

Omnivance Ledger is a lightweight, local-first web application that adapts seamlessly across the travel spectrum—from simple peer-to-peer bill splitting among friends to corporate travel expense compliance and manager approval workflows.

---

## 🎨 Design Theme
Built with an elegant, modern aesthetic:
- **Canvas / Background**: Warm Cream (`#FAF7F2` / `#FAF6F0`)
- **Cards & Surfaces**: Clean White with Linen borders (`#EFE7DE`)
- **Accents**: Very Light Red / Soft Rose (`#FFF1F2`, `#FFE4E6`, `#E11D48`)
- **Typography**: Plus Jakarta Sans & Lucide Icons

---

## 🚀 Quick Start (Run Locally)

### 1. Prerequisites
- **Node.js** (v18+ or v24)
- **npm**

### 2. Start the Server
In PowerShell:
```powershell
cd server
npm start
```

### 3. Open in Browser
Visit: **[http://localhost:5000](http://localhost:5000)**

---

## 🧪 Automated Testing

Execute the mathematical test suite verifying the Debt Simplification algorithm, in-memory caching, and corporate policy engine:

```powershell
cd server
npm test
```

---

## 🌟 Key Features

1. **Dual-Mode Architecture**:
   - **Friends Trip (Social)**: Minimal friction, equal/custom splits, net balance calculation, debt simplification, and UPI settlement links.
   - **Corporate Travel**: Policy engine (per-diem food limit checks, mandatory receipt thresholds), cost-center tagging, and manager approval workflows.
2. **Greedy Debt Simplification Algorithm**:
   - Reduces complex multi-party debt webs ($O(N^2)$) down to at most $N-1$ direct transfers.
3. **Local JSON Database Engine**:
   - Zero-dependency local persistence in `server/data/db.json` with thread-safe atomic writes.
4. **Audit & Reporting**:
   - 1-click CSV expense ledger export.

---

## 📁 Repository Structure

- `docs/PRD.md`: Official Product Requirements Document.
- `docs/TECH_SPEC.md`: Detailed Technical Specification.
- `docs/PROTOTYPE.md`: Prototype verification guide.
- `skills/`: SDLC guidance templates for PRD, Tech Spec, Prototyping, and Development.
- `server/`: Node.js Express backend and static frontend.
  - `server/src/`: Core routes, services, and algorithms.
  - `server/public/`: Sleek cream & light-red SPA frontend.
  - `server/data/db.json`: Clean local database.
  - `server/test/`: Automated test suite.
