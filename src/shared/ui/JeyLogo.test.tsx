import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { JeyLogo } from './JeyLogo'

test('학원 이름을 그린 그림이라 "JEY어학원"으로 읽히고, 로고 색 토큰으로 칠한다', () => {
  render(<JeyLogo variant="logo" height={34} />)

  const logo = screen.getByRole('img', { name: 'JEY어학원' })
  expect(logo).toHaveClass('bg-logo')
  expect(logo.style.maskImage).toMatch(/^url\(.*jey-logo\.png.*\)$/)
})

test.each([
  // 그림의 비율(가로 ÷ 세로)대로 폭을 정한다.
  ['mark', 30, 25, 'jey-mark.png'],
  ['logo', 34, 130, 'jey-logo.png'],
  ['tagline', 44, 169, 'jey-logo-tagline.png'],
] as const)('%s는 높이 %ipx일 때 폭 %ipx이고 그 그림을 쓴다', (variant, height, width, file) => {
  render(<JeyLogo variant={variant} height={height} />)

  const logo = screen.getByRole('img', { name: 'JEY어학원' })
  expect(logo.style.height).toBe(`${height}px`)
  expect(logo.style.width).toBe(`${width}px`)
  expect(logo.style.maskImage).toContain(file)
})

test('decorative면 화면 낭독기에 읽히지 않는다(감싼 링크가 이름을 갖는다)', () => {
  const { container } = render(<JeyLogo variant="mark" height={30} decorative />)

  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
})
