# ADR 0011 — Patient styling uses CSS Modules and semantic runtime tokens

- **Status:** Accepted
- **Date:** 2026-08-31
- **PRD:** [../product/PRD.md](../product/PRD.md) §§10.10, 11.2, 14, 18.5

## Context

Care Guide serves many practices from one application (`demodental.<platform-domain>`, `clinic-b.<platform-domain>`, …). Variation must be **data**, not generated CSS bundles.

A new tenant must not cause a new Tailwind build, runtime CSS compilation, tenant-specific JS bundles, or arbitrary tenant CSS.

The staff/admin surface (and parked chairside UI) already uses Tailwind and should keep it for development speed. The patient aftercare surface has a stricter performance and security contract.

## Decision

Split the App Router into two root layouts:

- `app/(staff)/` owns Tailwind and the existing staff/chairside UI.
- `app/(aftercare)/` owns a minimal native CSS base, CSS Modules, and server-resolved semantic CSS custom properties.

Patient branding is resolved on the server from `ClinicProfile` (`primaryColor`, `accentColor`) into semantic tokens such as `--cg-brand` and `--cg-on-brand`. Components style against purpose, not database field names.

Do **not**:

- use Tailwind as the patient styling system;
- use CSS-in-JS, styled-components, Emotion, or a runtime class generator;
- use a client `ThemeProvider`, React context, or `localStorage` merely to apply branding;
- invert the patient theme from `prefers-color-scheme: dark` in a way that changes clinic brand colours;
- add arbitrary CSS fields to `ClinicProfile` (`customCss`, `cssOverride`, `stylesheet`, `headerHtml`);
- load tenant-selected Google Fonts or arbitrary third-party font URLs.

Commercial clinic typefaces must be **presets** mapped to predefined tokens, self-hosted via `next/font` or equivalent, and reviewed against the performance budget. The current allowlist lives in `lib/branding/clinic-typeface.ts` and is applied on the patient tenant layout only.

## Consequences

- Tenant hostname routing (`/_sites/<tenant>/…`) stays URL-transparent.
- Existing staff URLs and parked chairside UI stay on Tailwind.
- Patient CSS payload must be measured in production and kept within the budget in [../architecture/PERFORMANCE.md](../architecture/PERFORMANCE.md).
- Colour values are validated hex only; readable `--cg-on-brand` is computed server-side with a WCAG 4.5:1 fallback to defaults.

## Notes for later implementation

Phase 1C may add CSS Modules for real patient components (`practice-header`, `guide-section`, `practice-contact-card`). It must not reintroduce Tailwind on the aftercare root or a runtime style library.
