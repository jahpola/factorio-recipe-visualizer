# Factorio Recipe Visualizer

A browser-based Factorio production-chain viewer. Import a game-derived preset,
search for a recipe, and explore its dependencies as a material-flow graph.
See [PLAN.md](./PLAN.md) for milestones and acceptance criteria.

## Requirements

- macOS, with Safari as the initial browser target; Chrome support follows.
- [fnm](https://github.com/Schniz/fnm) to manage Node.js.
- Node.js **24.22.1**, the latest LTS at initial setup.
- pnpm **12.15.0**, the latest stable release at initial setup.

The Node.js version is pinned in `.node-version`, and pnpm is pinned in
`package.json`. Future version upgrades should update these pins deliberately.
Factorio is needed to generate presets, but not to view an already exported preset.

## Setup

With fnm initialized in your shell:

```sh
fnm install
fnm use
npm install --global pnpm@12.15.0
pnpm install --frozen-lockfile
pnpm dev
```

The npm command only bootstraps pnpm for the selected fnm-managed Node.js version.
Use pnpm for all project dependencies and scripts. These commands do not change
your fnm default Node.js version.

Open the URL printed by Vite in Safari. The page displays
**Factorio Recipe Visualizer** and a local preset import control.

## View a production chain (Milestone 2)

1. Generate a preset with `pnpm export:factorio` (see below).
2. Click **Import preset (.json)** and choose the generated `preset.json`.
3. Search for **Electronic circuit** or `electronic-circuit`.
4. Select the recipe to display the complete green circuit chain.

Arrows follow inputs -> recipes -> products. Recipe cards are blue, raw resources
green, selected outputs purple, producer choices amber, and unresolved inputs red.
Labels also identify each node's role. Drag the canvas to pan; use the mouse wheel
or controls to zoom and **Fit View** to restore the full chain. Nodes can be moved.
Click a recipe card for ingredient/product details without quantities or ratios.
An accessible node summary is available below the canvas.

If an ingredient has multiple visible producer recipes, choose one from the
producer selectors below the graph; no alternative is silently selected. Missing
producers remain unresolved rather than being presented as raw resources. Invalid
imports show an error and retain the previous preset. Presets and recipe selections
are held in memory only; reload the page to start over.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

- `typecheck`: checks application and tooling TypeScript.
- `lint`: runs the Vite template's Oxlint configuration.
- `test`: runs component, preset validation, normalization, and graph tests.
- `build`: checks TypeScript and creates production assets in `dist/`.
- `pnpm preview`: serves the production build locally after building.

## Browser validation

Validate the development page and production preview in the latest stable Safari
on macOS. Import a real preset, select Electronic circuit, and check its ten nodes
and nine connections, including iron/copper ore boundaries. Test recipe switching,
pan/zoom/fit controls, invalid imports, and desktop/narrow viewport widths.
WebKit automation is useful supplemental coverage, but is not a substitute for
testing the installed Safari browser.

## Current scope

Milestone 2 adds local preset import, search/selection, graph layout with ELK.js,
and React Flow interaction. Traversal preserves byproducts and cycle connections,
but broader base-game/mod compatibility is not yet certified. Hidden recipes are
excluded from the browser and upstream producer candidates. Raw resources terminate
expansion even when recipes can also produce them.

No ratios, machine counts, icons, branch collapse controls, graph persistence,
backend, or database are included. Fluid temperature compatibility is not evaluated;
constrained ingredients produce a warning. Large-graph performance and incremental
expansion remain later work. The initial production bundle includes ELK's sizeable
layout engine and currently triggers Vite's large-chunk advisory.

## Export base-game data (Milestone 1)

With the project's Node.js version selected:

```sh
pnpm export:factorio
```

The exporter discovers Factorio in the local Steam libraries on macOS. For a
nonstandard installation, specify the application bundle explicitly:

```sh
FACTORIO_APP="/path/to/factorio.app" pnpm export:factorio
```

Each run creates a separate `.factorio-export/base-<unique suffix>/` directory
and prints its absolute path. It contains:

- `preset.json`: normalized and runtime-validated application data.
- `metadata.json`: game version, language, and selected mod versions.
- `script-output/`: the original prototype and localization dumps.
- Isolated configuration, mod list, and game logs for troubleshooting.

The exporter uses Factorio's `--dump-data` and `--dump-prototype-locale` commands.
It selects only base game, explicitly disabling bundled expansion and recycler
mods, and checks the loaded-mod log. It does not read or modify your active mod
settings or load any saves. All writable game paths are directed to the isolated
export directory. Failed exports return a nonzero exit code and retain diagnostic
files.

Validate the green circuit dependencies against a generated preset, substituting
the directory printed by the exporter:

```sh
pnpm verify:preset .factorio-export/base-<unique suffix>/preset.json
```

Raw exports and presets are ignored by Git: generate them locally rather than
redistributing game data. Icons are not extracted yet.

### Preset format and limitations

The version 1 schema in [src/data/preset.ts](./src/data/preset.ts) separates
materials, recipes, and resource sources. It preserves quantities, alternative
recipes, multiple products, probabilities, crafting categories, fluid temperature
constraints, hidden/initially-enabled flags, localized names, and subgroups.
Missing localization uses the internal name. Missing material references and
malformed records fail validation instead of being treated as raw resources.

The initial adapter is verified with **Factorio 2.1.23** and explicitly targets
**2.1.x**. Non-production recipe placeholders are excluded with recorded warnings.
Mining products and tile fluids define resource boundaries; mining-fluid
requirements are recorded, not recursively expanded. Temperature constraints are
preserved for future graph logic, not evaluated by this importer.

The installed Nullius 2.1.2 declares Factorio 2.1 support and requires base
>=2.1.22, which matches the installed game version. Actual Nullius export and
normalization remain Milestone 4 work; this command intentionally exports base
game only.
