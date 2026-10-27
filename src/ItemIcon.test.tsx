// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { ItemIcon } from './ItemIcon'

afterEach(cleanup)

test('does not render a broken image when no icon is provided', () => {
  const { container } = render(<ItemIcon />)
  expect(container.querySelector('img')).toBeNull()
})

test('renders decorative icons and reports decode failures with a text fallback', () => {
  const { container, rerender } = render(<ItemIcon src="data:image/png;base64,invalid" />)
  const image = container.querySelector('img')!
  expect(image.alt).toBe('')
  fireEvent.error(image)
  expect(screen.getByRole('img', { name: 'Icon unavailable' })).toBeDefined()
  expect(container.querySelector('img')).toBeNull()
  rerender(<ItemIcon src="data:image/png;base64,different" />)
  expect(container.querySelector('img')).not.toBeNull()
})
