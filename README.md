# Factorio Recipe Visualizer

A browser-based Factorio production-chain viewer. Stage 0 provides a React and
TypeScript Hello World application; recipe import and graph rendering are planned
in [PLAN.md](./PLAN.md).

## Requirements

- macOS, with Safari as the initial browser target; Chrome support follows.
- [fnm](https://github.com/Schniz/fnm) to manage Node.js.
- Node.js **24.22.1**, the latest LTS at initial setup.
- pnpm **12.15.0**, the latest stable release at initial setup.

The Node.js version is pinned in `.node-version`, and pnpm is pinned in
`package.json`. Future version upgrades should update these pins deliberately.
Factorio is not needed to run this Hello World application.

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

Open the URL printed by Vite in Safari. The page should display
**Factorio Recipe Visualizer - Hello World**.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

- `typecheck`: checks application and tooling TypeScript.
- `lint`: runs the Vite template's Oxlint configuration.
- `test`: runs the Hello World component smoke test with Vitest.
- `build`: checks TypeScript and creates production assets in `dist/`.
- `pnpm preview`: serves the production build locally after building.

## Browser validation

Validate the development page and production preview in the latest stable Safari
on macOS. Check that the heading and introductory text appear without horizontal
overflow at desktop and narrow viewport widths, and that no console errors occur.
WebKit automation is useful supplemental coverage, but is not a substitute for
testing the installed Safari browser.

## Current scope

No game data, recipe logic, graph dependencies, backend, or database is included in
Stage 0.
