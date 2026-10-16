import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Logo } from './Logo'

test('기본 색은 night다', () => {
  render(<Logo label="JEY" />)

  const logo = screen.getByText('JEY').parentElement
  expect(logo).toHaveClass('text-night')
  expect(logo).not.toHaveClass('text-white')
})

test('tone="white"면 흰색이다', () => {
  render(<Logo label="동탄고패스" tone="white" />)

  const logo = screen.getByText('동탄고패스').parentElement
  expect(logo).toHaveClass('text-white')
  expect(logo).not.toHaveClass('text-night')
})
