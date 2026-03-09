# Frontend Housekeeping Audit

Date: 2026-03-09

## Scope
- Repository-wide style and UI organization audit.
- Focus: consistency of colors/tokens, inline style reduction, and shared design patterns.

## Current Findings (Post-cleanup)
- Inline style usage is now concentrated in dynamic simulation-heavy surfaces:
  - `app/reactor/page.js`: 49
  - `app/farm/page.js`: 4
  - `app/reactor/reactorPreviews.js`: 2
  - `app/pixelbooth/page.js`: 1
  - `components/SiteHeader.js`: 1
  - `app/mixtape/components/ModalShell.js`: 1
- `style jsx` blocks removed from active pages.
- Build and lint pass.

## Standardization Completed
- Expanded shared design tokens in `app/globals.css` (`--gold`, `--danger`, `--success`, `--warning`).
- Added shared UI classes for repeated patterns:
  - badges (`ui-badgeNew`, desktop badge variants)
  - spacing/typography helpers
  - no-transform buttons for pagination actions
  - reusable section/card/header classes for home and feature pages
- Replaced static inline styles with classes in:
  - home (`app/page.js`)
  - todo (`app/todo/page.js`)
  - guestbook client/pages (`app/guestbook/*`, `components/GuestbookSubmissionModal.js`)
  - about (`app/about/page.js`)
  - pager (`app/pager/page.js`)
  - button page + chart/reset modal updates (`app/button/*`)
- Migrated resume styling from inline `<style jsx global>` into dedicated CSS module:
  - `app/resume/resume.module.css`
  - print behavior moved to global print rules in `app/globals.css`
- Refactored pixelbooth to feature CSS module and removed dead legacy modal code:
  - `app/pixelbooth/pixelbooth.module.css`
  - `app/pixelbooth/page.js`

## Remaining High-priority Backlog
1. `reactor` style architecture
- Continue converting the remaining inline blocks in `app/reactor/page.js` (mostly dynamic overlays/plot labels and row-state visuals) to class + CSS variable patterns where practical.
- Create a small feature token map (`:root`/`.reactor-*`) for recurring slate/amber/teal values to reduce hardcoded hex scatter.
- Evaluate extracting the catalogue table row/header inline style maps into dedicated classes plus per-row CSS variables.

2. `farm` UI helpers and page
- Convert remaining dynamic grid/row inline props in `app/farm/page.js` to CSS variable driven classes where it improves readability.
- Keep pixel-art palette constants as data-level color definitions where needed for sprites.

3. Color token harmonization
- Introduce feature-level aliases when custom palettes are needed.
- Default all non-feature-specific messaging/status colors to global tokens.

## Guardrails Going Forward
- Prefer CSS classes/modules for static styling.
- Use inline style only when the value is runtime-computed and highly dynamic.
- Reuse global/shared tokens for common states (warning/success/error/new badges).
- Keep feature-specific visual systems co-located in that feature's CSS module.
