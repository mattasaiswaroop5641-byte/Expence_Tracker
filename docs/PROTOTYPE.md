# Prototype Guide: Omnivance Expense Tracker

## How to Run Locally

1. Open PowerShell or Command Prompt in the project folder:
   ```powershell
   cd "c:\Users\Admin\Desktop\work_shop\workshop_day 2\Expence tracker\server"
   ```

2. Install dependencies (if not already installed):
   ```powershell
   npm install
   ```

3. Start the application:
   ```powershell
   npm start
   ```

4. Open your web browser at:
   👉 **http://localhost:5000**

---

## Test Accounts & Setup

- **Default State**: Clean empty database (`server/data/db.json`).
- **Quick Test Trip**: Click **"+ Create Your First Trip"** on the dashboard.
  - Enter Trip Name: `Goa Road Trip`
  - Members: `Alex, Rahul, Priya, Maya`
  - Mode: `Friends Trip`
- **Corporate Mode Test**:
  - Enter Trip Name: `Bangalore Tech Summit`
  - Members: `Alex, Sarah, Priya`
  - Mode: `Corporate` (sets ₹3,000 daily meal cap and ₹500 receipt threshold)

---

## Demonstrated Features (From PRD)

- [x] **Dual-Mode Trip Management**: Switch seamlessly between casual friends' outings and corporate travel workflows.
- [x] **Equal & Custom Bill Splitting**: Add an expense and automatically divide the bill across selected participants with real-time share preview.
- [x] **Greedy Debt Simplification Algorithm**: Live calculation of net balances and condensing multiple debts into minimum direct transactions.
- [x] **1-Click UPI Settlement Links**: Pre-generated UPI deep links for direct peer-to-peer debt payments.
- [x] **Corporate Policy Compliance Guard**: Automated detection of per-diem limit violations and missing mandatory receipts.
- [x] **Manager Approval Workflow**: 1-click "Approve Expense Report" / "Reject with Feedback" actions.
- [x] **Audit & Reporting**: 1-click download of structured expense CSV reports.
- [x] **Cream & Light-Red UI Theme**: Polished, responsive design system built with Tailwind CSS.
- [x] **Automated Test Suite**: Mathematical balance verification and policy test suite (`npm test`).
