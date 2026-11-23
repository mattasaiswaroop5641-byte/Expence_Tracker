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

1. **Dual-Mode Architecture & Travel Profiles**:
   - **Friends Trip (Social)**: Minimal friction, equal/custom splits, net balance calculation, debt simplification, and UPI settlement links.
   - **Corporate Travel**: Policy engine (per-diem meal limit checks, mandatory receipt thresholds), cost-center tagging, and manager approval workflows.
2. **Receipt File Attachments & Lightbox Viewer**:
   - Drag & drop upload for actual receipts (PNG, JPG, WebP, PDF).
   - In-app lightbox viewer and direct document download.
3. **Live GPS Geolocation Tracking**:
   - Geotag expenses with real-time GPS coordinates via HTML5 Geolocation.
   - 1-click Google Maps links for itemized trip route tracking.
4. **Member Contact Directory & Instant Messaging**:
   - Member phone numbers with 1-click WhatsApp chat (`https://wa.me/...`), direct phone call (`tel:...`), and 1-click UPI address copy.
5. **End Trip / Finalize Workspace**:
   - Conclude and lock trips to freeze all expenses and finalize peer settlements.
   - Reopen at any time with a single click.
6. **System Administration & Governance Panel**:
   - Dedicated Admin tab with workspace oversight, user role management, global corporate expense policy caps, live security audit trail, and full JSON database backup & restore.
7. **Greedy Debt Simplification Algorithm**:
   - Reduces complex multi-party debt webs ($O(N^2)$) down to at most $N-1$ direct transfers.
8. **Dual-Engine Persistence**:
   - Runs identically on local Node.js Express server (`server/data/db.json`) and statically on GitHub Pages via browser `localStorage`.
9. **Audit & Reporting**:
   - 1-click itemized CSV expense ledger export.

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
