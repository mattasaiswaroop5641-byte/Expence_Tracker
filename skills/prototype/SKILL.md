---
name: build-prototype
description: >-
  Guides first-year MCA students through building a lightweight, functional prototype from their PRD (/docs/PRD.md). Use when a student is ready to translate requirements into a working web or mobile code demo without scope creep or overengineering.
---

# Build Prototype Skill

## Purpose & Mentorship Philosophy
As a mentor to first-year MCA students, the goal of prototyping is **validation over perfection**. Students must produce a working vertical slice of their application that satisfies their class submission criteria without getting stuck in architectural rabbit holes, unnecessary third-party libraries, or premature optimization.

---

## 1. Prerequisites (Input Verification)
Before writing any code or installing packages, verify:
1. **PRD Exists**: Read `/docs/PRD.md`. If missing, redirect the student to complete the PRD first.
2. **Review Tech Stack**: Check the `Proposed Tech Stack` section in the PRD. Do not introduce new frameworks or databases without student consent.
3. **Confirm Scope**: Re-read `Key Features (In Scope)` and `Out of Scope`.

---

## 2. Core Prototyping Rules

1. **Strict Scope Discipline**:
   - Only implement features listed in `Key Features (In Scope)`.
   - Never implement features listed under `Out of Scope`. If a student suggests one, gently remind them of their submission deadline.
2. **UI & Mock Data First**:
   - Build clickable, visible screens using hardcoded sample data before configuring databases or authentication.
   - Ensures students have a tangible demo even if backend plumbing takes longer.
3. **Keep Code Simple & Readable**:
   - Avoid complex state management libraries (e.g., Redux) when simple local state (`useState` or standard variables) suffices.
   - Use meaningful variable names and add short explanatory comments for beginners.
4. **Single-Command Setup**:
   - The project must run with minimal commands (e.g., `npm install && npm run dev` or opening an `index.html`).

---

## 3. Step-by-Step Prototype Workflow

### Step 1: Feature Slice Plan
Review the PRD features and break them into 3 bite-sized milestones:
- **Milestone A (Skeleton)**: Project setup, routes/pages, and layout.
- **Milestone B (Interactive UI)**: Forms, lists, and user actions using mock data in memory.
- **Milestone C (Data Persistence & Integration)**: Connecting the backend API or database specified in the PRD.

Share this 3-milestone plan with the student and confirm they are comfortable with the pace.

### Step 2: Minimal Scaffold
1. Create a clean project folder structure matching their tech stack (e.g., `src/`, `components/`, `server/`).
2. Include a basic `.gitignore` (excluding `node_modules`, `.env`).
3. Verify the local dev server starts cleanly before adding features.

### Step 3: Implement Milestone A & B (Visual Prototype)
1. Build the primary user screens defined in the PRD.
2. Populate lists and tables with realistic mock data.
3. Wire buttons, modals, and forms so clicks produce visual feedback (e.g., alert, status change, new list item in state).
4. Have the student test and confirm the UI flow.

### Step 4: Implement Milestone C (Backend & Data Connection)
1. Set up minimal REST API endpoints or database collections strictly needed for the in-scope features.
2. Connect the frontend forms and lists to the API endpoints.
3. Implement basic error handling with friendly alert messages instead of raw crash screens.

### Step 5: Verification & Runbook
1. Walk through each item in the PRD's `Acceptance Criteria`.
2. Document how to run the prototype in `/docs/PROTOTYPE.md`.

---

## 4. Prototype Documentation Template (`/docs/PROTOTYPE.md`)
Always create or update `/docs/PROTOTYPE.md` with simple instructions:

```markdown
# Prototype Guide: [Project Name]

## How to Run Locally
1. Clone / open the project folder in VS Code.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the application:
   ```bash
   npm run dev
   ```
4. Open your browser at: `http://localhost:5173` (or specified port).

## Test Accounts / Mock Data
- Student User: `student@college.edu` / `pass123`
- Admin / Staff: `staff@college.edu` / `pass123`

## Demonstrated Features (From PRD)
- [x] Feature 1: [Short description]
- [x] Feature 2: [Short description]
- [x] Feature 3: [Short description]
```

---

## 5. Mentor Quality Checklist
Before marking the prototype phase complete, confirm:
- [ ] Every feature in `Key Features (In Scope)` is functional or visibly mocked.
- [ ] No `Out of Scope` features were added.
- [ ] The app runs locally without build or runtime errors.
- [ ] Setup instructions in `/docs/PROTOTYPE.md` were tested and work.
- [ ] Code is formatted, clean, and commented for a first-year student's level.