# Product Requirements Document (PRD): Trip Ledger

## 1. Project Overview

Trip Ledger is a lightweight web app for one person who manages a friends' trip. That person adds the group, records each shared expense, and at the end of the trip sees how the total splits across the people who took part. There is no login and no second user.

## 2. Target Users

- **Trip Manager**: The one friend who keeps the record. They add members, enter every expense, review what each person was part of, and run settlement when the trip is over.

## 3. Problem Statement

On a group trip, bills are shared by different subsets of friends. Some meals include everyone; a cab or a ticket may include only a few. Tracking this in chat or a notebook makes it hard to see what each person was part of, and harder still to total a fair share at the end. The group needs one simple record, kept by one person, that can split each bill only among the friends who shared it.

## 4. Key Features (In Scope)

1. **Member List**: The manager adds friends by name. The manager is included as a member. Members can be renamed or removed only when they are not attached to an expense.

2. **Add Expense**: The manager records one expense with a date, a short description, and an amount. They then select the subset of members who share that expense. The subset can be one person, several people, or the whole group.

3. **Expense List**: All expenses appear in date order, each showing date, description, amount, and the names of the members who share it.

4. **Expenses by Person**: The manager picks one member and sees only the expenses that member shares, plus that member's running share of those expenses.

5. **Settle Trip**: A Settle button shows each member's total share for the whole trip. Each expense is divided equally among the members selected for it. Amounts display to two decimal places, and the shares of an expense add back to its amount.

## 5. Out of Scope

To keep this project small and finishable as a single-manager tool, Version 1 will **not** include:

- User registration, login, or more than one person editing the data.
- Multiple trips. Version 1 tracks one trip.
- Marking who paid the bill. The screen shows each person's share of the expenses they were part of.
- Unequal splits, percentages, or custom amounts per person on one bill.
- Payments, UPI, or marking a share as paid.
- Receipt photos, categories, budgets, or currency conversion.
- Editing an expense after it is saved. The manager can delete an expense and enter it again.

## 6. Proposed Tech Stack

- **Frontend**: React with Tailwind CSS (simple layout that works on a phone and a laptop).
- **Storage**: Data stays in the browser with localStorage (members and expenses). No server account is required.
- **Hosting**: Localhost for development; a static build on Vercel or Netlify for the class demo.

## 7. Acceptance Criteria

The project is complete when:

- [ ] The manager can add at least two members and see them in the member list.
- [ ] The manager can add an expense with a date, description, amount, and a selected subset of members.
- [ ] An expense cannot be saved with a blank description, an amount of zero or less, or no members selected.
- [ ] The expense list shows every saved expense with its date, description, amount, and sharing members.
- [ ] Choosing a member shows only the expenses that member shares, and the sum of that member's shares.
- [ ] Settle shows every member and their total share, using an equal split of each expense across only the members selected for it.
- [ ] A member who shares no expenses shows a share of 0.00.
- [ ] Removing a member who is on an expense is blocked. Deleting an expense removes it from the list and from settlement.
