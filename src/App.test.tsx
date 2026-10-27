// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('renders the Hello World application', () => {
  render(<App />)

  expect(
    screen.getByRole('heading', {
      level: 1,
      name: 'Factorio Recipe Visualizer - Hello World',
    }),
  ).toBeDefined()
  expect(
    screen.getByText(/Next: import game recipes and visualize the green circuit/),
  ).toBeDefined()
})
