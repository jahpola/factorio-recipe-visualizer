---
name: preset-doctor
description: 'Inspect, validate, and troubleshoot Factorio recipe-visualizer preset JSON and local exports. Use when a preset import fails, pnpm verify:preset reports errors, or game version, mod metadata, or export logs need diagnosis.'
---

# Preset Doctor

Diagnose a preset using the repository's existing schema, verifier, and isolated
export artifacts. Do not edit the preset or game data unless the user explicitly
asks for a fix.

## Procedure

1. If the preset path or observed error is not provided, ask the user for it
   before running any command or reading any file. Work only with that preset
   and its associated export directory.
2. Read the preset metadata (`gameVersion`, `language`, and `mods`) and identify
   the preset's origin. Classify the origin as base-game only if `mods` is
   empty or lists only base-game entries. Otherwise classify it as modded. If
   `mods` is missing or unreadable, report the origin as unknown and do not run
   the base-game verifier. Do not treat a filename or user label as proof of
   which mods were loaded.
3. For a base-game preset, run:

   ```sh
   pnpm verify:preset <path/to/preset.json>
   ```

   Use the pinned Node.js and pnpm versions as documented in the repository.
   If the pinned Node.js or pnpm version cannot be found or activated, stop and
   report the missing version. Do not run `pnpm verify:preset` with another
   version.
   This command validates the preset schema and the exact green-circuit chain
   (including its 10 nodes, 9 connections, and raw ore boundaries). A failure
   in those chain assertions is not by itself evidence that unrelated modded
   content is invalid.
   For a modded or mixed preset, do not run `pnpm verify:preset` as a
   correctness check. Run only the schema validation and JSON parse checks in
   step 4, and report that green-circuit assertions were not applicable.
4. Classify failures using the output:
   - JSON read/parse errors: check that the selected file is a complete JSON
     preset, rather than a raw Factorio dump or metadata file.
   - Schema errors: report the failing field and validation message. Check the
     preset's structure and references against `src/data/preset.ts`.
   - Green-circuit assertions: compare the named recipe ingredients/products
     and ore sources with the base-game expectations in
     `scripts/verify-preset.ts`.
   - Export errors: inspect only the `.factorio-export/base-*/` directory whose
     name matches the preset's `gameVersion`. If zero or multiple directories
     match, report that ambiguity and stop before reading any export files.
     Inspect especially `metadata.json`, `factorio-current.log`, and the
     `script-output` files whose names or contents match the failing field,
     recipe, or error message reported in step 4.
5. For exported presets, compare metadata with the export log. The exporter
   targets Factorio 2.1.x and base game; it isolates its config and mod
   directory. Do not inspect or change active saves, user configuration, or
   active mod settings. If the export did not complete, report the failure
   rather than describing its preset as verified. If the preset's `gameVersion`
   is not 2.1.x, report the version mismatch as a finding and do not describe
   the export or verification as applying to that preset.
6. Summarize the path checked, command run, result, relevant evidence, and the
   smallest next diagnostic or corrective step. Distinguish a schema-valid
   preset from one whose production chain or mod compatibility has been
   verified.

## Boundaries

- Never silently repair, regenerate, or overwrite a preset.
- Do not claim mod compatibility from declared versions alone.
- Do not use the base-game green-circuit verifier as proof of correctness for
  arbitrary modded presets.
- Do not commit raw exports, presets, or game assets.
