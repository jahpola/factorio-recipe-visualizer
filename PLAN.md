# Factorio Recipe Visualizer Plan

## 1. Goal and scope

Build a tool inspired by [Foreman 2](https://github.com/DanielKote/Foreman2) that answers:

> What do I need to produce this item, and how are those ingredients made?

### Basic workflow

1. User selects a game-data preset, initially Factorio base game.
2. User searches for and selects a recipe.
3. The tool displays its production chain, expanding ingredients back to raw-resource inputs.
4. User can inspect steps, collapse branches, and choose alternative recipes where applicable.

### Initial scope

- Recipe dependencies and their visual connections.
- Recipes imported from the installed game, not manually maintained.
- Base-game functionality first, with a data model designed for mods such as Nullius.
- No production ratios, throughput calculations, or machine counts.

Initially show recipe ingredients, including fluids, but exclude fuel, electricity,
machine construction, and research requirements. Raw resources terminate the chain.

## 2. First example: green circuit production

The first functional graph milestone (Milestone 2) uses the **Electronic circuit**,
commonly called a green circuit.

```text
Iron ore -> [Iron plate recipe] -> Iron plate --------+
                                                    |
                                                    v
                                         [Electronic circuit recipe]
                                                    |
                                                    v
                                             Electronic circuit

Copper ore -> [Copper plate recipe] -> Copper plate
                                           |
                                           v
                                   [Copper cable recipe]
                                           |
                                           v
                                      Copper cable
                                           |
                                           +-> [Electronic circuit recipe above]
```

Arrows follow **material flow: inputs -> production steps -> output**.

The initial UI should make these facts immediately visible:

- Electronic circuits require iron plates and copper cables.
- Copper cables require copper plates.
- Iron and copper plates come from their respective ores.

No quantities or rates are displayed. Imported quantities can remain in the data
for future features.

## 3. User interface

### Recipe browser

- Search by localized name and internal identifier.
- Show recipe icons and game-defined groups.
- Clearly identify the active game version and mod preset.
- Selecting a recipe replaces the current production-chain view.

### Production-chain canvas

- Automatically arranged, left-to-right graph.
- Recipe cards with labeled ingredient and product connections.
- Distinct appearance for raw resources, production steps, and the selected output.
- Pan, zoom, fit-to-view, and branch expand/collapse.
- Clicking a card opens recipe details.
- A clear recipe picker when an ingredient has multiple production methods.

### Recipe details

- Recipe name, ingredients, products, and crafting category.
- Source preset and available provenance metadata.
- Byproducts and probabilistic outputs, when present.
- Warnings for missing data or unresolved dependencies.

Use names alongside icons so the tool remains usable before icon import is complete.

## 4. Game-data import

Treat each game-and-mod configuration as a separate preset. Base game, Space Age,
and Nullius must not be mixed into one recipe catalog.

### Available local environment

- Development machine: macOS.
- Steam and Factorio are already installed, as reported by the user.
- Use the local Steam installation of Factorio for the initial export.
- Before exporting, locate the installation and user-data directories and verify
  the installed Factorio version and enabled mods. Do not assume the default
  Steam library location.
- Export tooling must work on macOS and must not modify the existing game saves
  or mod configuration.

### Import pipeline

```text
Installed Factorio + enabled mods
                 |
                 v
       Game-supported export process
                 |
                 v
      Normalization and validation
                 |
                 v
         Versioned data preset
                 |
                 v
             Visualizer
```

### Implementation approach

1. Verify the supported export mechanism for the target Factorio version.
2. Export the resolved prototype data after mods have loaded. Do not attempt to
   interpret mod Lua files in the visualizer.
3. Normalize recipes, items, fluids, and resource metadata into a stable
   application format.
4. Include game version, mod names and versions, export schema version, and
   localization.
5. Handle icons through a separate asset-import step, respecting game and mod
   asset permissions.
6. Validate imports and report unsupported or inconsistent data explicitly.

The initial technical spike must establish a repeatable export procedure before
building the full UI.

## 5. Data and dependency model

Keep recipes separate from items and fluids.

A recipe can:

- Consume multiple ingredients.
- Produce multiple outputs.
- Share an output with other recipes.
- Participate in a cyclic chain.

### Core records

| Record | Purpose |
|---|---|
| Preset | Game version, enabled mods, schema version, language |
| Material | Stable identifier, item/fluid type, name, optional icon |
| Recipe | Identifier, ingredients, products, crafting category |
| Resource source | Identifies extractable raw-resource boundaries |
| Graph selection | Selected root recipe, chosen alternatives, collapsed branches |

Maintain a reverse index:

```text
Material identifier -> recipes that produce it
```

Use typed identifiers so an item and a fluid with the same internal name cannot
collide.

## 6. Production-chain generation

Starting from the selected recipe:

1. Add its ingredient and product connections.
2. Find producer recipes for each ingredient.
3. Expand an unambiguous producer automatically.
4. When several producers exist, show a choice rather than silently selecting one.
5. Stop at recognized raw resources or inputs explicitly marked as externally
   supplied.
6. Show missing producers as unresolved inputs, not automatically as raw resources.
7. Detect cycles and display a loop connection without recursively expanding
   forever.
8. Preserve all outputs of multi-output recipes, including unused byproducts.

For large modded chains, expand incrementally and show explicit expansion
boundaries. The full chain should remain accessible without requiring the browser
to render everything immediately.

This is a dependency viewer, not a proof that a factory is balanced or
self-sustaining.

## 7. Recommended technical direction

For a browser-based first version:

- Node.js tooling must use pnpm for dependency installation and script execution.
- Use the latest Node.js LTS release and latest stable pnpm release available at
  Stage 0 setup. Record and pin the resolved versions for reproducibility.
- Initially support the latest stable Safari on macOS. Add support for the latest
  stable Chrome next; Safari is the first browser validation target.
- TypeScript + React for the application.
- React Flow for interactive recipe cards and connections.
- ELK.js for automatic layout.
- Versioned JSON presets for imported game data.
- Local file import, avoiding a backend initially.

Keep three modules separate:

1. Data import and validation.
2. Dependency-graph generation.
3. Graph rendering and interaction.

This allows graph logic to be tested without the UI and keeps a future desktop
wrapper optional.

## 8. Implementation milestones

### Stage 0: Technical tooling and Hello World

- Verify Node.js availability on macOS and use the latest LTS release, recording
  and pinning the resolved version.
- Install or enable the latest stable pnpm release if needed, pin the resolved
  project package-manager version, and use pnpm for all dependency installation
  and script execution.
- Scaffold a minimal Vite application using React and TypeScript.
- Commit the pnpm lockfile for reproducible dependency installation.
- Render a simple "Factorio Recipe Visualizer - Hello World" page.
- Provide scripts for local development, type-checking, linting, and production
  builds.
- Set up Vitest and a Hello World component smoke test, exposed through
  `pnpm test`.
- Document prerequisites and the commands needed to install dependencies, start
  the application, and run checks.
- Verify the page in the latest stable Safari on macOS and run the type-check,
  lint, and production build successfully. Validate Chrome when its support is
  added.

Keep this stage focused on the working application skeleton. Game-data extraction,
recipe logic, and graph rendering belong to later milestones.

**Done when:** a fresh checkout can install dependencies with `pnpm install`,
start the Hello World application with `pnpm dev`, and pass the documented checks.

#### Stage 0 implementation status

- Implemented with fnm-managed Node.js 24.22.1 and pnpm 12.15.0, pinned in
  `.node-version` and `package.json`.
- React, TypeScript (strict mode), Vite, Oxlint, and Vitest are installed, with a
  generated pnpm lockfile and setup instructions in [README.md](./README.md).
- Frozen-lockfile installation, type-checking, linting, the component smoke test,
  and production build pass.
- Development and production pages were verified in VS Code's integrated browser
  at widths of 1280, 375, and 320 pixels: expected content, no horizontal overflow,
  and no browser errors.
- The user confirmed that the development page opens in native Safari 27.2.
  Automated Safari layout and error checks remain pending: after remote automation
  was enabled, repeated Safari WebDriver attempts timed out connecting to a browser
  session. Integrated browser checks do not establish full Safari compatibility.

### Milestone 1: Prove game-data extraction

- Choose the initial Factorio version and base-game configuration.
- Export resolved game data.
- Produce a validated preset.
- Confirm the green circuit chain against that export.

**Done when:** a repeatable procedure generates the recipe data without
hand-editing recipes.

#### Milestone 1 implementation status

- Located Steam Factorio 2.1.23 and verified its built-in `--dump-data` and
  `--dump-prototype-locale` options.
- Added `pnpm export:factorio`: discovers the macOS Steam application, uses an
  isolated configuration/mod directory, and exports English base-game data.
- Explicitly disables bundled expansion/recycler mods and verifies loaded mods.
- Generated and validated a local schema-version-1 preset containing 271
  materials, 206 production recipes, and 12 resource/tile-fluid sources.
- Added `pnpm verify:preset <file>` and verified the complete green circuit recipe
  dependencies and iron/copper ore boundaries against the real export.
- Added normalization/validation tests; all six tests, type-checking, linting,
  and production build pass.
- Confirmed active config.ini, mod-list.json, and mod-settings.dat SHA-256
  checksums were unchanged before and after export. No saves were loaded.
- Installed Nullius 2.1.2 declares compatibility with Factorio 2.1 and base
  >=2.1.22. Actual modded preset support remains unverified until Milestone 4.
- Icons and graph UI are deferred. Generated game data remains local and ignored
  by Git; see [README.md](./README.md) for reproduction commands.

### Milestone 2: Green circuit vertical slice

- Add recipe search and selection.
- Render the complete green circuit dependency chain.
- Add automatic layout, pan, zoom, and fit-to-view.
- Display raw-resource boundaries clearly.

**Done when:** selecting Electronic circuit produces the example graph from
imported data.

#### Milestone 2 implementation status

- Implemented local validated preset import, recipe search by name/internal ID,
  recipe selection, and visible game/mod metadata.
- Added a pure dependency builder and ELK/React Flow canvas with automatic
  left-to-right layout, pan, zoom, fit-to-view, draggable nodes, role labels, and
  selected-output/raw-resource styling.
- Included producer selectors for ambiguous ingredients, unresolved-input warnings,
  basic recipe details, an accessible node summary, and cycle-safe traversal.
- Verified the real Factorio 2.1.23 green circuit graph: exactly 10 nodes and 9
  connections, with iron and copper ore as raw-resource boundaries.
- Integrated-browser checks cover switching to copper cable, zoom/fit controls,
  widths of 1280/375/320 pixels without horizontal overflow, and invalid imports
  retaining the active preset. Native Safari graph validation remains pending.
- Production-preview import/selection also renders the exact green circuit graph
  without browser errors. All 22 tests, type-checking, linting, frozen-lockfile
  installation, and production build pass; Vite reports a large-chunk advisory
  for the bundled layout engine.
- Branch collapse, incremental expansion, icon import, temperature compatibility
  evaluation, and comprehensive base-game/mod coverage remain future work.

### Milestone 3: General base-game support

- Support fluids, alternative recipes, byproducts, and cycles.
- Add recipe details and branch controls.
- Add explicit missing-data and unsupported-feature messages.

**Done when:** representative base-game chains work beyond the green circuit
example.

### Milestone 4: Mod compatibility

- Import a separate Nullius preset.
- Test complex alternatives, loops, and multi-output chains.
- Improve incremental expansion and large-graph responsiveness.

**Done when:** representative Nullius chains work without hardcoded mod-specific
recipe rules.

## 9. Validation

- Green circuit test: expected recipes, ores, and connections appear; no
  quantities or rates appear.
- Import tests: malformed records and missing references produce actionable
  errors.
- Graph tests: cover alternative producers, shared ingredients, fluids,
  byproducts, self-loops, and multi-step cycles.
- UI tests: selecting a recipe updates the graph; branch and alternative controls
  work.
- Compatibility tests: validate both a real base-game export and a real Nullius
  export.

**First deliverable:** a searchable, game-data-driven green circuit production
graph, not a ratio calculator or full Foreman replacement.
