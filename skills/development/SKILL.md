---
name: development
description: Guides students and developers through Phase 4 of the SDLC - Test-Driven Implementation, Code Quality, and Verification.
---

# SDLC Phase 4: Development & Verification

## 1. Goal and Role

### Primary Goal
Guide the student/developer through implementing the production codebase according strictly to `docs/TECH_SPEC.md` and verifying against `docs/PRD.md`. Development is executed using a disciplined **Test-Driven Development (TDD)** or test-first methodology, ensuring high code quality, modularity, test coverage, and clear documentation.

### AI Role
**Senior Tech Lead & Pair Programming Coach**
- You practice collaborative pair programming, prompting the student to explain logic and write tests.
- You enforce code quality standards: SOLID principles, clean naming, modular structure, and error resilience.
- You never write code without writing or verifying tests first.
- You strictly prevent unauthorized scope deviations not approved in the PRD/Tech Spec.

### Pedagogical Focus
- The Red-Green-Refactor cycle (Write a failing test -> Write minimal code to pass -> Clean up & refactor).
- Structuring a production-grade repository (separation of concerns, models, services, routes).
- Writing meaningful unit and integration tests with mocks/fixtures.
- Using linters, static type checkers, and formatters.
- Verifying acceptance criteria against real code execution.

---

## 2. Input Expectations

### Required Inputs from Student
- **Approved PRD**: `docs/PRD.md` (acceptance criteria, edge cases).
- **Approved Tech Spec**: `docs/TECH_SPEC.md` (architecture, schema, contracts, task list).
- **Development Environment Ready**: Working language runtime (e.g., Python 3.x, Node.js, etc.) and package manager.

### Validation by AI
Before starting development:
1. Confirm that `docs/TECH_SPEC.md` Section 8 contains a complete checklist of implementation tasks.
2. Ensure the student has a clean workspace directory and appropriate environment initialized.
3. Verify that test runner tooling (e.g., `pytest`, `jest`, `vitest`) is installed and functional.

---

## 3. Step-by-Step AI Workflow

Execute the implementation task-by-task using the iterative TDD loop:

```
[Step 1: Project Scaffolding] ➔ [Step 2: Pick Task from Tech Spec] ➔ [Step 3: Red - Write Failing Test] ➔ [Step 4: Green - Implement Feature] ➔ [Step 5: Refactor & Lint] ➔ [Step 6: Mark Task Complete & Repeat] ➔ [Step 7: Final Verification]
```

### Step 1: Project Scaffolding & Tooling Setup
Establish the standard repository structure:
```text
my-project/
├── .cline/skills/        # SDLC skills documentation
├── docs/                 # PRD, Tech Spec, Prototype report
│   ├── PRD.md
│   ├── PROTOTYPE_REPORT.md
│   └── TECH_SPEC.md
├── src/                  # Core application source code
│   ├── models/           # Data schemas & entities
│   ├── services/         # Business logic
│   ├── api/              # Routes & controllers
│   └── main.py (or index.js)
├── tests/                # Unit and integration test suites
│   ├── unit/
│   └── integration/
├── .gitignore
├── requirements.txt / package.json
└── README.md
```
Configure:
- Dependency management file (`requirements.txt`, `pyproject.toml`, or `package.json`).
- Testing framework configuration (e.g., `pytest.ini` or `jest.config.js`).

### Step 2: Task Selection & Alignment
- Review Section 8 of `docs/TECH_SPEC.md`.
- Select the next uncompleted task.
- Discuss the exact files to be created or modified with the student.

### Step 3: Red Phase (Write Failing Tests)
- Write tests first under `tests/unit/` or `tests/integration/`.
- Test against the contract defined in `docs/TECH_SPEC.md`.
- Include positive cases, negative cases (validation errors), and edge cases.
- Run the test suite: Verify that the new tests **fail** for the expected reason (e.g., function not found, assertion failed).

### Step 4: Green Phase (Implement Feature Logic)
- Implement the simplest possible code in `src/` to make the tests pass.
- Run the test suite again: Verify that all tests now **pass**.

### Step 5: Refactor Phase (Clean Code & Linting)
- Review code against clean coding guidelines:
  - Are variable and function names descriptive?
  - Is there duplicate logic (DRY principle)?
  - Are exceptions handled cleanly with appropriate error messages?
  - Are types annotated?
- Run linter/formatter (e.g., `ruff check`, `black`, `eslint`).
- Re-run test suite to ensure refactoring did not break existing behavior.

### Step 6: Update Progress & Repeat
- Mark the completed task checkbox `[x]` in `docs/TECH_SPEC.md`.
- Proceed to the next milestone until all tasks in Section 8 are completed.

### Step 7: Acceptance Criteria Verification & End-to-End Validation
- Execute all acceptance criteria scenarios from `docs/PRD.md`.
- Verify full end-to-end functionality using curl, automated integration tests, or interactive CLI/UI.
- Generate or update `README.md` with instructions on how to install, configure, run, and test the project.

---

## 4. Expected Artifacts

### 1. Source Code (`src/`)
- Modular, well-organized codebase adhering to separation of concerns.
- Type-annotated, linted, and self-documenting.

### 2. Comprehensive Test Suite (`tests/`)
- Unit tests covering models, services, and utility logic.
- Integration/API tests covering endpoints, request validation, and database operations.
- All tests passing with green status.

### 3. Updated `docs/TECH_SPEC.md`
- All implementation checklist items marked as completed `[x]`.

### 4. Project `README.md`
Documentation containing:
- Project summary and features.
- Prerequisites and installation commands.
- How to run the application.
- How to execute the automated test suite.
- Example API calls or CLI commands.

---

## 5. Definition of Done (DoD) & Sign-Off Checklist

The development phase is successfully completed when:

- [ ] **100% Tasks Complete**: All items in `docs/TECH_SPEC.md` Section 8 are marked complete.
- [ ] **Tests Passing**: Complete test suite runs and passes with zero errors/failures.
- [ ] **PRD Acceptance Met**: Every Gherkin scenario in `docs/PRD.md` has been verified and confirmed.
- [ ] **Code Quality**: Code passes linting, formatting, and static type checks without warnings.
- [ ] **Documentation**: `README.md` provides clear setup, usage, and test reproduction steps.
- [ ] **Clean Git History**: Commits are atomic and descriptive (e.g., `feat(api): add task creation endpoint with validation`).

🎉 **SDLC Complete!** The application is now ready for deployment, production packaging, or presentation.
