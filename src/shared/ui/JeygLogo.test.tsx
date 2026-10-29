import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { JeygLogo } from './JeygLogo'

test('원본 그림을 그대로 쓰고 "제이지러닝"으로 읽힌다', () => {
  render(<JeygLogo height={165} />)

  const logo = screen.getByRole('img', { name: '제이지러닝' })
  expect(logo.getAttribute('src')).toContain('jeyg-logo-vertical.svg')
  // 원본 비율(1500:1650) 그대로
  expect(logo).toHaveAttribute('height', '165')
  expect(logo).toHaveAttribute('width', '150')
})
