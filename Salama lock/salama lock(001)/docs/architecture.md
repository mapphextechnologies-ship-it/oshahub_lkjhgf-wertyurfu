# SALAMA LOCK Paygo Architecture

## Goal

The application is organized as a modular fintech platform. Business behavior stays the same, but screens and portal entry points now live in domain-specific modules so the codebase can grow without turning into a flat collection of pages.

## Folder Structure

- `src/modules/finance`: finance dashboard, payments, customers, commissions, inventory, reports, reconciliation, notifications, settings
- `src/modules/public`: login, portal entry, public landing, next-of-kin acceptance
- `src/modules/customers`: customer portal
- `src/modules/agents`: agent portal
- `src/modules/admin`: admin portal entry points
- `src/modules/backoffice`: back office portal entry point
- `src/components`: shared UI components
- `src/layouts`: portal layouts
- `src/hooks`: shared hooks
- `src/utils`: shared pure helpers
- `src/services`: API and business services
- `src/lockers`: device-lock integration logic
- `src/uploadedAdmin`: admin CRM application
- `src/backOffice`: back office application

## Module Rules

- Keep portal screens inside the matching domain module.
- Put reusable UI in `src/components`, not inside pages.
- Put business logic in `src/services`, `src/utils`, or `src/lockers`, not inside route components.
- Use `@/` aliases for shared imports so files can move without rewriting deep relative paths.
- Use module `index.js` barrels for top-level imports.

## Naming Conventions

- Use clear, domain-based names such as `PaymentsScreen`, `FinanceDashboard`, `CustomerPortalScreen`, and `BackOfficePortalScreen`.
- Avoid vague names like `temp`, `page2`, or `component1`.
- Keep service names aligned with the domain they serve, such as `paymentService` or `commissionService`.

## Permission Model

- Finance and admin views should enforce role checks before rendering.
- Keep sensitive operations behind explicit screens or service actions.
- Do not expose tokens, passwords, or internal identifiers in browser-visible UI.

## Extension Guide

Add new features by placing them in the smallest matching domain module first:

- New finance views go under `src/modules/finance`
- New customer features go under `src/modules/customers`
- New agent features go under `src/modules/agents`
- New admin CRM features go under `src/uploadedAdmin`
- New back office features go under `src/backOffice`

If a feature starts to share logic across modules, move that logic into `src/services`, `src/utils`, or `src/components` rather than copying it into multiple screens.
