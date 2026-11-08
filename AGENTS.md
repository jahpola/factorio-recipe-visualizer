# Project Guidelines

## Purpose and scope

- Build a Factorio recipe dependency visualizer inspired by Foreman 2.
- Follow [PLAN.md](./PLAN.md) for milestones and acceptance criteria; consult
  [README.md](./README.md) for setup, export commands, and known limitations.
- Use recipes exported from the game, not manually maintained recipe definitions.
- Initially visualize dependencies without ratios, throughput, or machine counts.
- Base game comes first; keep the data model suitable for mods such as Nullius.

## Tooling

- Development is on macOS, with Node.js managed by fnm.
- Use the versions pinned in `.node-version` and `package.json`. Run `fnm use`
  before project commands, or `fnm exec --using=24.22.1 pnpm <command>` when the
  shell has not initialized fnm.
- Use pnpm for dependency installation and scripts. Preserve `pnpm-lock.yaml`;
  do not introduce npm or Yarn lockfiles.
- Upgrade runtime and package-manager pins deliberately, not as incidental work.
- The application uses React, strict TypeScript, Vite, Oxlint, and Vitest.
- Safari on macOS is the first browser target; Chrome follows. Integrated-browser
  or WebKit checks must not be reported as native Safari verification.

## Architecture and data

- Keep import/normalization, dependency-graph logic, and UI rendering separate.
- Runtime preset validation lives in [src/data/preset.ts](./src/data/preset.ts);
  the Factorio 2.1 adapter lives in
  [src/data/normalize.ts](./src/data/normalize.ts).
- Separate materials from recipes. Preserve typed `item:` and `fluid:` IDs,
  alternative producers, multiple outputs, probabilities, and fluid constraints.
- Reject malformed data and missing references explicitly. Do not silently
  interpret unresolved ingredients as raw resources.
- Source IDs must be non-empty and unique; required fluids must reference fluids.
- Graph traversal must handle cycles and preserve byproducts without assuming a
  balanced production flow.

## Game export safety

- Steam and Factorio are installed locally. Discover the installation rather than
  hardcoding a user's filesystem path; support the `FACTORIO_APP` override.
- Use [scripts/export-factorio.ts](./scripts/export-factorio.ts) for isolated
  exports. Never modify active game saves, configuration, mod lists, or settings.
- If an export fails or the loaded mod list cannot be confirmed, do not generate
  a preset. Report the failing step and the observed mod list, and do not label
  the output as base game.
- Verify the actual loaded mods before describing a preset as base game.
- Keep generated game data in the ignored `.factorio-export/` directory. Do not
  commit raw exports, presets, or game assets.
- Declared mod/version compatibility is not proof of a successful modded export.

## Validation and documentation

- Add focused regression tests for changed behavior.
- For application code changes, run all of `pnpm test`, `pnpm typecheck`,
  `pnpm lint`, and `pnpm build`. Documentation-only changes require none of
  these.
- After importer/schema changes, also run
  `pnpm verify:preset <path/to/preset.json>` against a real local export.
- If the Factorio installation cannot be discovered and `FACTORIO_APP` is
  unset, stop and report that the export could not be run. Do not mark the
  milestone complete, and list `pnpm verify:preset` as pending verification.
- Keep the green circuit dependency chain as the first end-to-end example.
- Update README.md when setup, export commands, or known limitations change, and
  update PLAN.md only when a milestone's acceptance criteria status changes.
  Distinguish completed checks from pending verification. Do not mark a
  milestone complete on partial evidence.
- Preserve unrelated worktree changes. Create or amend commits only when asked.
