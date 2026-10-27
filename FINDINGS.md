# Code Review Findings

Review scope: preset validation in `src/data/preset.ts`.

## 1. Source IDs are not validated

- **Severity:** Low
- **Location:** `src/data/preset.ts`, source schema and source validation
- **Finding:** Source IDs accept empty strings and duplicate values. If consumers use
  these IDs to identify or update sources, duplicates can make source identity
  ambiguous.
- **Recommendation:** Require a non-empty source ID and reject duplicate source
  IDs during preset validation.
- **Resolution:** Fixed. Source IDs must be non-empty, and duplicate IDs produce
  an error at `sources[index].id`. Regression tests cover invalid IDs and distinct
  sources producing the same material.

## 2. `requiredFluid` accepts item IDs

- **Severity:** Low
- **Location:** `src/data/preset.ts`, `requiredFluid` field in the source schema
- **Finding:** The field uses the general material-ID schema, which permits both
  `item:` and `fluid:` identifiers. A source can therefore declare an item, such
  as `item:iron-ore`, as its required fluid.
- **Recommendation:** Validate `requiredFluid` with a fluid-only identifier schema.
- **Resolution:** Fixed. `requiredFluid` now requires a `fluid:<name>` identifier;
  the existing material-reference check remains in place. Regression tests cover
  item IDs, unknown fluids, valid fluids, and omitted requirements.

## Validation

The existing test, type-check, and lint commands passed during review:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`

Post-fix validation passed:

- `pnpm test`: 13 tests passed, including seven source-validation regression tests.
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm verify:preset .factorio-export/base-RyjszX/preset.json`: the existing
  Factorio 2.1.23 preset and green circuit dependencies remain valid.
