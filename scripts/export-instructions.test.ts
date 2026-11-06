import { expect, test } from 'vitest'
import { finderRevealCommand } from './export-instructions.ts'

test('quotes the preset path for a copyable Finder reveal command', () => {
  expect(finderRevealCommand('/project/.factorio-export/base-test/preset.json'))
    .toBe("open -R '/project/.factorio-export/base-test/preset.json'")
  expect(finderRevealCommand("/project's files/.factorio-export/base-test/preset.json"))
    .toBe("open -R '/project'\\''s files/.factorio-export/base-test/preset.json'")
})
