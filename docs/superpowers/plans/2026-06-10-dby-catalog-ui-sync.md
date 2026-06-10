# D.BY Catalog UI Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the D.BY content-selection screen and theme-builder kiosk preview use the SMY catalog visual system without changing D.BY business logic.

**Architecture:** A small pure helper resolves preview-only deep links. `DbaseKioskFlow` retains workflow ownership and renders a SMY-style catalog shell for its contents state. The theme builder loads that exact state in its iframe.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Node test runner

---

### Task 1: Preview deep link

**Files:**
- Create: `src/components/dbase/preview-step.ts`
- Create: `src/components/dbase/preview-step.test.mjs`
- Modify: `src/components/dbase/DbaseKioskFlow.tsx`

- [ ] Write a test proving only `preview=1&step=contents` opens contents.
- [ ] Run the test and verify it fails because the helper is missing.
- [ ] Implement the pure resolver and use it for the initial D.BY step.
- [ ] Run the test and verify it passes.

### Task 2: Catalog UI synchronization

**Files:**
- Modify: `src/components/dbase/DbaseKioskFlow.tsx`

- [ ] Add category state and filtered item derivation.
- [ ] Render the contents step with the SMY catalog header and responsive grid.
- [ ] Match D.BY cards to the SMY card geometry while retaining occupancy data.
- [ ] Preserve the D.BY floating confirmation bar and workflow transitions.

### Task 3: Theme-builder route

**Files:**
- Modify: `src/app/(admin)/admin/theme/ThemeBuilderClient.tsx`

- [ ] Point the kiosk preview tab to the D.BY contents deep link.
- [ ] Update comments so the preview routes describe actual behavior.

### Task 4: Verification

- [ ] Run the preview-step unit test.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run build`.
- [ ] Inspect the final diff for unrelated changes.
