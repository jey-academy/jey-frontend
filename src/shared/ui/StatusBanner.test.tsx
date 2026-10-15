import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Notice } from './Notice'
import { StatusBanner } from './StatusBanner'

test.each([
  ['valid', '사용할 수 있는 패스예요', 'bg-mint-bg'],
  ['used', '이미 사용한 패스예요', 'bg-gray-bg'],
  ['expired', '사용 기한이 지난 패스예요', 'bg-red-bg'],
  ['canceled', '발급이 취소된 패스예요', 'bg-gray-bg'],
] as const)('StatusBanner: %s 상태는 기본 문구와 상태 색으로 보여준다', (status, title, color) => {
  render(<StatusBanner status={status} />)

  const banner = screen.getByRole('status')
  expect(banner).toHaveTextContent(title)
  expect(banner).toHaveClass(color)
})

test('StatusBanner: 제목과 설명을 주면 기본 문구 대신 그 문구를 보여준다', () => {
  render(
    <StatusBanner status="used" title="10월 7일에 사용했어요" description="JEY 어학원 동탄관" />,
  )

  const banner = screen.getByRole('status')
  expect(banner).toHaveTextContent('10월 7일에 사용했어요')
  expect(banner).toHaveTextContent('JEY 어학원 동탄관')
  expect(banner).not.toHaveTextContent('이미 사용한 패스예요')
})

test('StatusBanner: className을 덧붙일 수 있다', () => {
  render(<StatusBanner status="valid" className="mt-4" />)

  expect(screen.getByRole('status')).toHaveClass('mt-4', 'bg-mint-bg')
})

test('StatusBanner: 설명이 없으면 제목만 보여준다', () => {
  render(<StatusBanner status="valid" />)

  expect(screen.getByRole('status')).toHaveTextContent(/^사용할 수 있는 패스예요$/)
})

test('StatusBanner: 발급 취소는 사용 완료와 색이 같아 아이콘 모양이 다르다', () => {
  const { container: used } = render(<StatusBanner status="used" />)
  const { container: canceled } = render(<StatusBanner status="canceled" />)

  expect(canceled.querySelector('svg')).not.toBeNull()
  expect(canceled.querySelector('svg')?.innerHTML).not.toBe(used.querySelector('svg')?.innerHTML)
})

test('StatusBanner: 아이콘은 장식이라 읽히지 않는다', () => {
  const { container } = render(<StatusBanner status="expired" />)

  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})

test('Notice: 에러 안내를 알림으로 그린다', () => {
  render(<Notice>패스를 찾을 수 없어요. 이름과 전화번호를 다시 확인해 주세요.</Notice>)

  expect(screen.getByRole('alert')).toHaveTextContent(
    '패스를 찾을 수 없어요. 이름과 전화번호를 다시 확인해 주세요.',
  )
  expect(screen.getByRole('alert')).toHaveClass('bg-red-bg', 'text-pill-expired')
})

test('Notice: className을 덧붙일 수 있다', () => {
  render(<Notice className="mt-4">연결 상태를 확인해 주세요.</Notice>)

  expect(screen.getByRole('alert')).toHaveClass('mt-4', 'bg-red-bg')
})
