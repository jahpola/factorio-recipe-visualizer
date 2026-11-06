# Code Review Findings

## Review 2: whole codebase (2026-11-06)

Review scope: importer, dependency graph, preset storage, UI, and export scripts
at commit `7adb18a`. Findings 1–3 are fixed; the remaining findings are open.

### Bugs

#### 1. Wood is reported as an unresolved input in the base game

- **Severity:** Medium
- **Location:** `src/data/normalize.ts`, source construction
- **Finding:** Raw sources are built only from `resource` prototypes and fluid
  tiles. Minable entities such as trees and rocks are not sources, so item:wood
  has neither a producer nor a source.
- **Evidence:** Confirmed against the local base-game 2.1.23 export. The Small
  electric pole and Wooden chest chains warn "No visible producer or
  raw-resource source for Wood (item:wood)" and render wood as unresolved.
- **Recommendation:** Add sources for minable entities with item products (at
  least trees; optionally rocks), for example as a new source kind such as
  `entity`. Add a regression test and extend `verify:preset` with a wood check.
- **Resolution:** Fixed. The normalizer records minable `tree`, `simple-entity`,
  and `fish` prototypes as `entity` sources. Real Nullius data showed that 11 of
  the 13 materials these entities yield also have visible recipes (for example
  stone, silica, and fish). Entity sources therefore end a branch only when no
  visible recipe produces the material, so they do not hide recipe producers.
  Regression tests cover normalization, unknown products, entity-only
  materials, and recipe-produced materials. `verify:preset` now checks that wood
  is raw in the Small electric pole chain.

#### 2. `~` mod dependencies are treated as optional

- **Severity:** Medium
- **Location:** `scripts/factorio-mods.ts`, `requiredDependencyName`
- **Finding:** In Factorio, the `~` prefix marks a required dependency that does
  not affect load order. The resolver skips it, so the dependency is not copied
  into the isolated mod directory and Factorio refuses to load the mod.
- **Recommendation:** Treat `~` dependencies as required. Add a `~` case to the
  dependency test in `scripts/factorio-mods.test.ts`.
- **Resolution:** Fixed. Dependency strings are parsed as
  `[prefix] name [operator version]`; `~` dependencies are required. Names that
  contain spaces, such as `Inventory Sensor` in Nullius's optional dependencies,
  are now parsed whole. Regression tests cover every prefix and resolving a
  `~` dependency.

#### 3. Mods that depend on DLC cannot be exported

- **Severity:** Medium
- **Location:** `scripts/factorio-mods.ts`, `resolveModDependencies`;
  `scripts/export-factorio.ts`, mod-list generation
- **Finding:** Only `base` is treated as built in. A required dependency on
  `space-age`, `quality`, or `elevated-rails` fails with "not available
  locally", because these ship in the game data directory, not as local mod
  archives. As a result, the filter in `export-factorio.ts` that keeps a
  selected DLC enabled can never apply.
- **Recommendation:** Either treat DLC names as built in (enable them and read
  their versions from `Contents/data/<name>/info.json`), or reject them with an
  explicit "DLC dependencies are unsupported" error and remove the dead filter.
- **Resolution:** Fixed in code; real export pending. The exporter reads
  installed expansion mods from `Contents/data/<name>/info.json`, resolves them
  (and their own dependencies) as built-in mods, enables them in the isolated
  mod list without copying archives, and records their versions for the
  load-check. A missing expansion fails with "Required built-in mod … is not
  installed with this Factorio." Unit tests cover resolution and metadata
  loading. A real export of a mod that requires Space Age has not been run.

#### 4. Unrelated mod-directory problems block every modded export

- **Severity:** Low
- **Location:** `scripts/factorio-mods.ts`, `loadLocalMods`
- **Finding:** Any archive in the mods directory with a duplicate installed
  version or an unreadable `info.json` aborts the export, even when that mod is
  not requested. Unpacked mod directories are skipped silently, so a requested
  mod installed as a directory shows up as "not available locally".
- **Recommendation:** Index all candidates and fail only when a mod in the
  resolved dependency set is ambiguous or invalid. Support unpacked mods, or
  report them explicitly.

### Robustness (mainly for mods such as Nullius)

#### 5. The importer validates every prototype in the dump

- **Severity:** Low
- **Location:** `src/data/normalize.ts`, `rawSchema`
- **Finding:** `prototypeSchema` is applied to every prototype of every type. A
  mod prototype with an unexpected shape for `category`, `fluid`, `hidden`, or
  similar fields fails the whole import, even when it is unrelated to recipes.
- **Recommendation:** Validate only the prototypes the adapter consumes:
  recipes, resources, tiles, fluids, and prototypes that have `stack_size`.

#### 6. Recipes without `ingredients` or `results` cause an error

- **Severity:** Low
- **Location:** `src/data/normalize.ts`, recipe normalization
- **Finding:** Factorio 2.x makes both fields optional, with an empty default.
  The adapter throws when either is missing. Note that the preset schema
  requires at least one product, so a recipe with no results also needs an
  explicit policy.
- **Recommendation:** Treat a missing `ingredients` field as empty. Decide
  whether to exclude recipes without results, with a warning.

#### 7. Raw sources hide recipe producers

- **Severity:** Low
- **Location:** `src/graph/production.ts`, ingredient expansion
- **Finding:** A material that has a raw source is marked raw before its
  producers are considered. In the base export this affects only water and
  crude oil, which are also produced by barrel emptying. In mods where
  materials are both minable and craftable, the alternative producers are
  hidden. This conflicts with the requirement to preserve alternative
  producers.
- **Recommendation:** Offer "raw source" as one choice next to the recipe
  producers instead of letting it override them.

#### 8. Icon embedding opens every icon file at once

- **Severity:** Low
- **Location:** `scripts/icons.ts`, `embedIcons`
- **Finding:** `Promise.all` reads every material and recipe icon concurrently.
  For large mods this can exceed the macOS default open-file limit (EMFILE).
  Not observed yet.
- **Recommendation:** Read the icons in batches or one at a time.

#### 9. Missing Steam library file gives an unclear error

- **Severity:** Low
- **Location:** `scripts/export-factorio.ts`, installation discovery
- **Finding:** When `FACTORIO_APP` is not set and `libraryfolders.vdf` is
  missing, the export fails with a raw ENOENT error instead of the
  "Factorio not found. Set FACTORIO_APP…" message.
- **Recommendation:** Treat a missing library file as "no extra libraries" and
  fall through to the existing not-found error.

### UX and performance

- **The graph resets zoom and pan on every change**
  (`src/graph/ProductionGraph.tsx`): `key={layout.version}` remounts React Flow
  and runs `fitView` on each branch expansion or producer choice. Use
  controlled nodes and edges and keep the viewport.
- **Layout runs on the main thread** (`src/graph/ProductionGraph.tsx`):
  `elkjs/lib/elk.bundled.js` blocks the UI on large graphs and accounts for
  much of the bundle that exceeds Vite's 500 kB advisory. Use the ELK web
  worker and lazy-load the graph.
  **Resolution:** Fixed. Layout runs in ELK's classic Web Worker
  (`src/graph/layout-engine.ts`). A superseded or unmounted layout terminates
  the worker, so stale layouts no longer delay new ones. A worker that fails to
  load rejects pending layouts instead of leaving them pending forever. The
  graph and React Flow load lazily. Pure ELK mapping lives in
  `src/graph/layout.ts`. A layout result that is missing nodes is reported
  instead of crashing. See "Validation of the layout worker" below.
- **The recipe list is recomputed on every keystroke** (`src/App.tsx`): the
  filter and the full list re-render on each input change. Memoize, use
  `useDeferredValue`, or virtualize the list for large mod catalogs.
- **Producer choices are cleared when switching recipes** (`src/App.tsx`):
  keeping choices per material would avoid repeating the same selection.
- **Ingredient labels can be stale** (`src/graph/production.ts`): a material's
  kind is decided per ingredient, so a material that is also produced by an
  expanded multi-output recipe can still be labelled "Expand branch".
- **Fragile state check** (`src/App.tsx`): the forgetting state is detected by
  comparing the status text. Use a dedicated boolean.

### Validation of fixes 1–3

Validated on 2026-11-06, on uncommitted changes on top of `7adb18a`:

- `pnpm test`: 9 test files passed and 1 skipped; 61 tests passed and 1
  skipped.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed. Vite still reports
  the 500 kB bundle advisory.
- Factorio was not re-run. The existing dumps in `.factorio-export/base-RyjszX`
  (base 2.1.23) and `.factorio-export/mods-nullius-jwoj5v` (Nullius 2.1.2 on
  Factorio 2.1.24) were re-normalized into a scratch location with the new code.
  `verify:preset` passed on the base result, including the new wood check, and
  `verify:mod-preset` passed on the Nullius result. The new wood check fails on
  the previously generated base preset, as expected.
- Comparing fully expanded chains for every visible recipe with the old and new
  normalizer: 0 of 1966 Nullius chains changed; 5 of 202 base chains changed,
  all because wood or raw fish became raw (wooden chest, small electric pole,
  shotgun, combat shotgun, spidertron).
- Existing `preset.json` files predate fix 1. Re-run `pnpm export:factorio` (or
  re-import a fresh export) to get entity sources in the app.

### Validation of the layout worker

Validated on 2026-11-06, on uncommitted changes on top of `e3f71f8`:

- `pnpm test` (13 files, 74 tests; 1 file and 1 test skipped), `pnpm typecheck`,
  `pnpm lint`, and `pnpm build` passed. Initial JavaScript chunk: 1936 kB
  (599 kB gzip) before, 325 kB (99 kB gzip) after. The graph chunk is 185 kB
  and loads on first use. The ELK worker script (1595 kB) is a separate asset,
  loaded only by the worker. Vite no longer reports the large-chunk advisory.
- Native Safari 27.2, production preview:
  - `pnpm verify:safari` with the base 2.1.23 preset passed twice. The first
    attempt timed out after the first recipe click (heading still "Select a
    recipe", no errors or alerts). It did not happen again in those two runs
    or in a separate WebDriver-click debug run. The cause is unknown.
  - `verify:safari` had an existing bug that also fails on `e3f71f8`. After
    "Forget saved preset" it expected the graph to restart collapsed, but
    forgetting keeps the expanded graph. The check now expects the complete
    graph.
  - New `pnpm verify:safari-large` with the Nullius 2.1.2 preset (53.8 MB)
    passed. `nullius-probe` was fully expanded through the UI to 1061 nodes and
    2328 edges in 16 rounds. While a layout was pending, the longest main-thread
    stall was 18 ms. A search typed during layout was handled in a 15 ms round
    trip. Layout and render took 1832 ms in total. React Flow rendering the
    final graph still stalls the main thread for about 215 ms.
  - The same check against `e3f71f8` (main-thread ELK) did not finish. Each
    click in an expansion round started a main-thread layout that was never
    cancelled. One WebDriver command then waited longer than its 180 s timeout
    for the page to respond.
- Chrome has not been checked.

### Validation of the review

Validated on 2026-11-06 at commit `7adb18a`:

- `pnpm test`: 9 test files passed and 1 skipped; 53 tests passed and 1
  skipped.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm verify:preset` passed against both local base-game 2.1.23 exports
  (`.factorio-export/base-eEoNIY/preset.json` and
  `.factorio-export/base-RyjszX/preset.json`).
- Finding 1 was reproduced with a scratch script against
  `.factorio-export/base-RyjszX/preset.json`. Findings 2–9 come from code
  inspection and have not been reproduced with a real export.
- `pnpm build` was not re-run in this review.

## Review 1: preset validation (2026-10-27)

Review scope: preset validation in `src/data/preset.ts`. Both findings are
resolved.

### 1. Source IDs are not validated

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

### 2. `requiredFluid` accepts item IDs

- **Severity:** Low
- **Location:** `src/data/preset.ts`, `requiredFluid` field in the source schema
- **Finding:** The field uses the general material-ID schema, which permits both
  `item:` and `fluid:` identifiers. A source can therefore declare an item, such
  as `item:iron-ore`, as its required fluid.
- **Recommendation:** Validate `requiredFluid` with a fluid-only identifier schema.
- **Resolution:** Fixed. `requiredFluid` now requires a `fluid:<name>` identifier;
  the existing material-reference check remains in place. Regression tests cover
  item IDs, unknown fluids, valid fluids, and omitted requirements.

### Validation

Validated on 2026-10-27:

- `fnm exec --using=24.22.1 pnpm test`: 6 test files and 27 tests passed.
- `fnm exec --using=24.22.1 pnpm typecheck`: passed.
- `fnm exec --using=24.22.1 pnpm lint`: passed.
- `fnm exec --using=24.22.1 pnpm build`: passed. Vite reported that the
  generated JavaScript bundle exceeds its 500 kB advisory threshold.
- Preset verification was not run at the time: no preset files were present
  under `.factorio-export/`. It has since passed; see the Review 2 validation.
