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

## View a production chain (Milestones 2-4)

1. Generate a preset with `pnpm export:factorio` (see below).
2. Click **Import preset (.json)** and choose the generated `preset.json`, or
   drag that file from Finder into the import area.
3. Search for **Electronic circuit** or `electronic-circuit`.
4. Select the recipe, then expand the iron plate, copper cable, and copper
   plate branches to display the complete green circuit chain.

Arrows follow inputs -> recipes -> products. Recipe cards are blue, raw resources
green, selected outputs purple, producer choices amber, and unresolved inputs red.
Labels also identify each node's role. Drag the canvas to pan; use the mouse wheel
or controls to zoom and **Fit View** to restore the visible chain. Nodes can be moved.
Click a recipe card for ingredient/product details without quantities or ratios.
New exports include game-rendered recipe, item, and fluid icons in the browser,
graph, and details panel. Older presets without icons still work with text labels.
An accessible node summary is available below the canvas.

If an ingredient has multiple visible producer recipes, choose one from the
producer selectors below the graph; no alternative is silently selected. Missing
producers remain unresolved rather than being presented as raw resources. Invalid
imports show an error and retain the previous preset and its saved browser copy.

### Easier loading on macOS

Exports live in the hidden `.factorio-export/` folder. In the file picker, press
**Cmd+Shift+.** to show hidden folders, or **Cmd+Shift+G** and paste the absolute
export directory printed by `pnpm export:factorio`. The exporter also prints the
full preset path and a copyable `open -R '.../preset.json'` command to reveal it in
Finder. You can then drag the file into the import area. Finder does not open
automatically, and exports stay in their isolated, Git-ignored directories.

Each valid import is automatically remembered in **IndexedDB on this browser**,
including its embedded icons. Reloading restores that dataset, but not the
selected recipe, search, producer choices, or collapsed branches. The filename
and saved-state message identify the current import. **Forget saved preset**
deletes the browser copy without clearing the current dataset or graph; reload
after forgetting to start empty.

Storage is local to the browser and page origin (scheme, hostname, and port);
switching between `localhost` and `127.0.0.1`, or between development and preview
ports, uses separate storage. Nothing is uploaded. Private browsing, clearing
browser data, or browser storage eviction can prevent restoration. Storage errors
are shown explicitly: a valid import remains usable for the current session even
if saving fails, and an older saved dataset may remain. Invalid saved data shows
a recovery message; import another file or use the forget action to remove it.
Importing does not watch the original file: reimport after exporting new data.

Produced-material branches start collapsed and can be expanded one at a time;
there is no fixed graph-size cap. A branch with multiple producers requires a
selection before it can expand. Expanded branches can be collapsed and reopened.
Recipe details identify variable or probabilistic outputs and show fluid
temperature constraints; unused co-products are labeled in the graph. The viewer
does not display production quantities or rates. Cycle, temperature-evaluation,
and mining-fluid limitations are shown as warnings where relevant.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

- `typecheck`: checks application and tooling TypeScript.
- `lint`: runs the Vite template's Oxlint configuration.
- `test`: runs component, preset validation, normalization, graph, and exporter
  dependency-resolution tests.
- `build`: checks TypeScript and creates production assets in `dist/`.
- `pnpm preview`: serves the production build locally after building.

To additionally test browser-storage serialization with a real icon-bearing export:

```sh
FACTORIO_PRESET="/absolute/path/to/preset.json" pnpm test scripts/preset-storage.integration.test.ts
```

This uses an IndexedDB emulator, not a native browser.

## Browser validation

Validate the development page and production preview in the latest stable Safari
on macOS. Import a real base-game preset, select Electronic circuit, and check
that it starts with the root recipe and direct inputs, then expands to ten nodes
and nine connections including iron/copper ore boundaries. Test recipe switching,
pan/zoom/fit and progressive branch expansion/collapse controls, invalid imports,
and desktop/narrow viewport widths. Also inspect Chemical science pack and Lubricant;
for Lubricant, choose Advanced oil processing for Heavy oil and confirm the fluid
inputs and additional oil products are visible.
WebKit automation is useful supplemental coverage, but is not a substitute for
testing the installed Safari browser.

### Repeatable native Safari checks

Enable **Develop > Developer Settings > Allow remote automation** in Safari
(the menu location can vary by Safari version). Save unfinished input, quit Safari
normally, and wait for it to exit. In a separate terminal, start Apple's driver:

```sh
/usr/bin/safaridriver --port 4444
```

With the development server running, use a real exported preset:

```sh
pnpm verify:safari http://127.0.0.1:5173 .factorio-export/base-<unique suffix>/preset.json
```

After `pnpm build`, start `pnpm preview` and repeat with its URL (normally
`http://localhost:4173`). The command creates and cleans up its own native Safari
session; stop the driver with Ctrl-C when finished. Do not interact with Safari
during the automated checks.

The checks cover local import, progressive expansion to the exact green circuit
graph and ore boundaries,
image decoding, recipe switching/inspection, zoom/fit controls, branch
collapse/reopen at desktop/narrow widths, retained alternative producer
selections, and real oil-processing byproduct annotations. They also cover
invalid-import retention, IndexedDB restoration after reload, forgetting without
clearing the current graph, horizontal overflow, and console/runtime errors captured
**after the initial page renders**. A clearly labeled supplemental UI fixture
modifies an in-memory copy of the imported preset to check fluid temperature
constraints, variable/probabilistic output annotations, and the unsupported
temperature warning; these fields are absent from the real base-game export.
The fixture does not establish real-export support for those features or modify
the preset file on disk. Saved test data is removed at the end of the session.
The original Milestone 3 checks and the added loading-improvement reload/forget
checks passed in native Safari 27.2 against both development and production
preview. An initial session-creation timeout was resolved on retry.
Finder reveal, hidden-folder picker shortcuts, and native file dragging remain
pending manual verification.

For large-graph responsiveness, use a modded preset with a huge production chain,
such as Nullius:

```sh
pnpm verify:safari-large http://localhost:4173 .factorio-export/mods-nullius-<unique suffix>/preset.json [recipe-id]
```

Without a recipe ID, the script finds the visible recipe with the largest fully
expanded chain (this takes several seconds; in Nullius 2.1.2 it is
`nullius-probe`, with 1061 nodes and 2328 edges). It expands that chain through
the UI, choosing the first listed producer for each choice, waits for the exact
expected node and edge counts, and measures main-thread stalls with a timer
heartbeat. It fails if the main thread stalls for more than 250 ms while a layout
is pending, and checks that the recipe search still responds during layout.

The import is supplied through an in-page `File` and
change event, not the operating-system file picker. Startup console errors,
manual pan/drag, and the OS file picker still require separate verification.
Requested widths are 1280, 375, and 320 pixels; the command prints actual viewport
widths and explicitly warns when Safari clamps a request. Safari 27.2 currently
clamps 320 to 336 pixels, so this does not verify a 320-pixel native viewport.

If session creation times out even with remote automation enabled, quit Safari
normally, wait for it to exit, and retry. During investigation on Safari 27.2,
the native log reported **"Safari was not launched for automation"**: the
already-running browser rejected the session, while a fresh WebDriver-launched
instance accepted it. Do not repeatedly extend client timeouts or treat
integrated-browser checks as native Safari evidence.

## Current scope

Milestones 2-4 add local preset import, search/selection, graph layout with ELK.js,
and React Flow interaction. The real Factorio 2.1.24 base-game export is verified
with green circuit, chemical science, fluid, alternative-producer, and
multi-output/byproduct chains. Hidden recipes are excluded from the browser and
upstream producer candidates. Raw resources terminate expansion even when
recipes can also produce them. Materials gathered from trees, rocks, and fish
(for example wood) are shown as raw only when no visible recipe produces them, so
they never hide recipe producers. Nullius 2.1.2 is separately verified against a
Factorio 2.1.24 export for alternatives, a production cycle, and multi-output
byproducts. The mod-selection exporter is data-driven, but this is not a blanket
compatibility certification for untested mods.

No ratios, machine counts, graph persistence, backend, or server database are included.
Fluid temperature compatibility is not evaluated; constrained ingredients produce
a warning. Mining-fluid dependencies are not expanded. Dependency graphs now
expand progressively without an arbitrary node cap; fully expanding a very large
modded chain may still take time. Layout runs in ELK's Web Worker, so the page
stays responsive while a large graph is arranged; a layout that is superseded by
a newer chain is cancelled. The graph (React Flow) loads on first use and the
ELK worker script (about 1.6 MB) loads only when a layout starts, keeping the
initial JavaScript chunk at about 325 kB.

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

- `preset.json`: normalized and runtime-validated application data, with embedded
  PNG icons (a single-file local asset bundle).
- `metadata.json`: game version, language, and selected mod versions.
- `script-output/`: the original prototype and localization dumps.
- Isolated configuration, mod list, and game logs for troubleshooting.

The exporter uses Factorio's `--dump-data`, `--dump-prototype-locale`, and
`--dump-icon-sprites` commands. Icon export initializes graphics and Steam, so
Steam must be running and a graphical macOS session must be available.
It selects only base game, explicitly disabling bundled expansion and recycler
mods, and checks the loaded-mod log. It does not read or modify your active mod
settings or load any saves. All writable game paths are directed to the isolated
export directory. Failed exports return a nonzero exit code and retain diagnostic
files.

Validate the green circuit and representative fluid/alternative/byproduct chains
against a generated preset, substituting the directory printed by the exporter:

```sh
pnpm verify:preset .factorio-export/base-<unique suffix>/preset.json
```

Raw exports and presets are ignored by Git: generate them locally rather than
redistributing game data or assets. Rendered icons are embedded as PNG data URLs
so no asset folder import, external requests, or backend is needed. Recipe icons
are taken from the recipe export rather than inferred from the first product,
preserving layered/composite icons rendered by Factorio. Actual modded icon
rendering has not been validated in the browser.

To add icons to a previously generated preset, rerun `pnpm export:factorio` and
import the new `preset.json`. Missing exported icons produce import notes and
text-only labels. Undecodable images show an "Icon unavailable" fallback without
removing the associated name. Only embedded PNG icons are accepted by the schema.

## Export a mod configuration (Milestone 4)

The exporter can create a separate preset for an explicit combination of
locally installed mods. For example:

```sh
pnpm export:factorio --mods nullius
```

By default, the exporter reads mod archives from
`~/Library/Application Support/factorio/mods`. Set `FACTORIO_MODS` to another
mod directory when needed. Required dependencies, including `~` dependencies
that do not affect load order, are resolved recursively and copied into a new
isolated export directory; optional (`?`, `(?)`) and incompatible (`!`)
dependencies are not enabled. Required built-in expansion mods (`space-age`,
`quality`, `elevated-rails`) are enabled from the game installation instead of
the mod directory, and their versions are read from the game data. Exporting a
mod that depends on Space Age has not yet been verified with a real export. Missing required mods and ambiguous duplicate installed
versions fail explicitly. The active mod list, settings, and saves are not read
or modified. The exporter checks the actual loaded mod set on every dump step, compares
logged code-mod versions with the selected archives, and records the resolved
configuration and exact archive versions in `metadata.json` and `preset.json`.
The directory must contain Factorio-format `<name>_<version>.zip` archives; if
multiple versions of a mod are present, point `FACTORIO_MODS` at a directory
containing the intended versions.

The generated preset is under
`.factorio-export/mods-nullius-<unique suffix>/preset.json`. Validate the real
Nullius production chain with:

```sh
pnpm verify:mod-preset .factorio-export/mods-nullius-<unique suffix>/preset.json
```

This verification checks the installed Nullius catalog for alternative
producers, a representative cycle, and multi-output byproducts. Generate each
mod combination separately; never combine base-game and modded recipes into one
preset. Raw exports, presets, and game assets remain local and ignored by Git.

### Preset format and limitations

The version 1 schema in [src/data/preset.ts](./src/data/preset.ts) separates
materials, recipes, and resource sources. It preserves quantities, alternative
recipes, multiple products, probabilities, crafting categories, fluid temperature
constraints, hidden/initially-enabled flags, localized names, and subgroups.
Missing localization uses the internal name. Missing material references and
malformed records fail validation instead of being treated as raw resources.

The initial adapter is verified with **Factorio 2.1.23** and explicitly targets
**2.1.x**. Non-production recipe placeholders are excluded with recorded warnings.
Mining products, tile fluids, and minable trees, rocks, and fish define resource
boundaries; mining-fluid
requirements are recorded, not recursively expanded. Temperature constraints are
preserved for future graph logic, not evaluated by this importer.

The installed Nullius 2.1.2 declares Factorio 2.1 support and requires base
>=2.1.22. It has been exported and normalized against the installed Factorio
2.1.24 build with its required local dependencies. The default exporter command
still exports base game only; request modded data explicitly with `--mods`.
