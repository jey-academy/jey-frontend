import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PassCard } from './PassCard'
import type { PassStatus } from './passStatus'

function renderCard(status: PassStatus) {
  render(
    <PassCard
      status={status}
      benefitLabel="JEY 어학원 동탄관 첫 달 수강료"
      discount="5%"
      holderName="김*윤"
      passNumber="DT-7KQ4MX"
      expiresOn="2026.11.16"
    />,
  )
  return screen.getByRole('article', { name: '동탄고패스 카드' })
}

test('서버가 준 값을 그대로 보여준다', () => {
  const card = renderCard('valid')

  expect(card).toHaveTextContent('JEY 어학원 동탄관 첫 달 수강료')
  expect(card).toHaveTextContent('5%할인')
  expect(card).toHaveTextContent('김*윤')
  expect(card).toHaveTextContent('DT-7KQ4MX')
  expect(card).toHaveTextContent('사용 기한2026.11.16')
})

test('사용 가능하면 채도를 낮추지 않고 도장도 없다', () => {
  const card = renderCard('valid')

  expect(card).not.toHaveClass('saturate-[.15]')
  expect(within(card).getByText('사용 가능')).toBeInTheDocument()
  for (const stamp of ['사용 완료', '기간 만료', '발급 취소']) {
    expect(within(card).queryByText(stamp)).not.toBeInTheDocument()
  }
  expect(within(card).getByText('5%')).toHaveClass('text-glow')
})

test.each([
  ['used', '사용 완료'],
  ['expired', '기간 만료'],
  ['canceled', '발급 취소'],
] as const)('%s 상태는 채도를 낮추고 "%s" 도장을 찍는다', (status, label) => {
  const card = renderCard(status)

  expect(card).toHaveClass('saturate-[.15]')
  // Pill과 도장에 같은 문구가 있다. 도장은 화면 낭독기에서 뺀다.
  const [pill, stamp] = within(card).getAllByText(label)
  expect(pill).not.toHaveAttribute('aria-hidden')
  expect(stamp).toHaveAttribute('aria-hidden', 'true')
  expect(within(card).getByText('5%')).not.toHaveClass('text-glow')
})

test.each([
  ['valid', '사용 가능', 'bg-mint-bg'],
  ['used', '사용 완료', 'bg-gray-bg'],
  ['expired', '기간 만료', 'bg-red-bg'],
  ['canceled', '발급 취소', 'bg-gray-bg'],
] as const)(
  '%s Pill은 흰 바탕용 색(%s) 대신 어두운 카드 위 색을 쓴다',
  (status, label, lightBg) => {
    const card = renderCard(status)

    const pill = within(card).getAllByText(label)[0]
    expect(pill).not.toHaveClass(lightBg)
    expect(pill.className).toMatch(/text-\[#/)
  },
)

test('워드마크는 흰색이고 물결 그래픽은 읽히지 않는다', () => {
  const card = renderCard('valid')

  expect(within(card).getByText('동탄고패스').parentElement).toHaveClass('text-white')
  expect(within(card).getByText('동탄고패스').parentElement).not.toHaveClass('text-night')
  const ripples = card.querySelector('svg[viewBox="0 0 420 420"]')
  expect(ripples).toHaveAttribute('aria-hidden', 'true')
})
