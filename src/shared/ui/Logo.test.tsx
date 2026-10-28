import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Logo } from './Logo'

// 4KB 미만 SVG는 Vite가 data: 주소로 넣어 src에 파일 이름이 없다. 대신 SVG 안의 <title>(원본 파일 이름)로 원본인지 확인한다.
// 정식 로고로 바꿔 4KB를 넘거나 <title>이 빠지면 이 확인을 바꿔야 한다.
const JEYG_MARK = '01_black_01_symbol_transparent'

test('기본 색은 night다', () => {
  render(<Logo label="JEY" />)

  const logo = screen.getByText('JEY').parentElement
  expect(logo).toHaveClass('text-night')
  expect(logo).not.toHaveClass('text-white')
})

test('tone="white"면 흰색이다', () => {
  render(<Logo label="제이G패스" tone="white" />)

  const logo = screen.getByText('제이G패스').parentElement
  expect(logo).toHaveClass('text-white')
  expect(logo).not.toHaveClass('text-night')
})

test('밝은 바탕에서는 제이G 로고 원본 그림을 그대로 쓰고, 화면 낭독기에는 이름만 읽힌다', () => {
  render(<Logo label="제이G패스" markSize={20} />)

  const mark = screen.getByText('제이G패스').previousElementSibling as HTMLImageElement
  expect(mark.tagName).toBe('IMG')
  expect(mark.getAttribute('src')).toContain(JEYG_MARK)
  expect(mark).toHaveAttribute('alt', '')
  // 여백만큼 크게, 원본 비율(1200:1100) 그대로
  expect(mark).toHaveAttribute('height', '24')
  expect(mark).toHaveAttribute('width', '26')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('어두운 바탕에서는 제이G 로고 모양을 흰색으로 칠한다', () => {
  render(<Logo label="제이G패스" tone="white" />)

  const mark = screen.getByText('제이G패스').previousElementSibling as HTMLElement
  expect(mark.tagName).toBe('SPAN')
  expect(mark).toHaveAttribute('aria-hidden', 'true')
  expect(mark).toHaveClass('bg-white')
  expect(mark.style.maskImage).toContain(JEYG_MARK)
  expect(document.querySelector('img')).toBeNull()
})
