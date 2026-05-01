# Kiosk PIN Self-Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let kiosk users identify themselves with `name + middle 4 digits of phone number`, choose between rental and self-edit, and resolve rare PIN collisions by selecting from school and birth date candidates.

**Architecture:** Extend the server-side general user lookup to support middle-4 PIN matching and collision candidate responses, then update the kiosk rental dialog to branch between rental and edit actions while reusing the existing registration form shape for self-edit. Keep admin-only edits for name and full phone number.

**Tech Stack:** Next.js App Router, React Hook Form, Zod, Drizzle ORM, SQLite

---

### Task 1: Server lookup and self-edit action support

**Files:**
- Modify: `src/lib/actions/generalUser.ts`

- [ ] Add a PIN lookup helper that searches by exact name and middle-4 digits, returns `single_match`, `multiple_matches`, or `not_found`.
- [ ] Add a kiosk-safe update helper that only updates `gender`, `birthDate`, `school`, and `personalInfoConsent` for an existing general user.
- [ ] Reuse existing validation where possible and keep name/full phone edits admin-only.

### Task 2: Kiosk dialog branching and collision resolution

**Files:**
- Modify: `src/components/item/RentalDialog.tsx`

- [ ] Replace the identification input from full phone number to `pin`.
- [ ] Add an action mode for `rent` vs `edit`.
- [ ] On lookup collision, show candidate cards with `school` and `birthDate` and let the user pick the correct profile.
- [ ] On self-edit, preload the existing profile into the existing registration form UI and save through the kiosk-safe update helper.
- [ ] Keep the current new-user registration flow for unmatched lookups.

### Task 3: Verification

**Files:**
- Modify: none

- [ ] Run `npm run build` to catch type/runtime integration issues.
- [ ] Review the diff for accidental regressions in kiosk rental and admin user management behavior.
