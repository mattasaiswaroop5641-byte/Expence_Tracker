# Purpose
Guide Cline to create a beginner-friendly Technical Specification (`/docs/TECH_SPEC.md`) based on `/docs/PRD.md` for first-year MCA students.

# Process
1. **Read PRD First**: Open and review `/docs/PRD.md`. If missing, do not proceed; prompt the student to create the PRD first.
2. **Respect Constraints**:
   - Strictly use the `Proposed Tech Stack` from the PRD.
   - Design architecture and APIs only for `Key Features (In Scope)`.
   - Never design features listed in `Out of Scope`.
3. **Draft Tech Spec**: Generate the document using the Tech Spec Template below.
4. **No Implementation Code**: Provide data schemas, endpoint signatures, and folder trees. Do not write full app code in this phase.
5. **Beginner-Friendly Language**: Explain technical terms simply (e.g., explain what an endpoint or schema does).

# Tech Spec Template
Structure the document as:
- `# Technical Specification: [Project Name]`
- `## 1. System Architecture`: Simple Client-Server diagram and overview.
- `## 2. Recommended Folder Structure`: Clean, standard project directory tree.
- `## 3. Database Schema (Data Models)`: Collections/tables, fields, data types, and primary keys.
- `## 4. API Endpoints (Contracts)`: Table of routes, HTTP methods, request bodies, and expected responses.
- `## 5. Frontend Component Hierarchy`: List of key UI components and their responsibilities.
- `## 6. Basic Security & Data Validation`: Required fields and simple safety rules.

# Output Location
Save to: `/docs/TECH_SPEC.md`