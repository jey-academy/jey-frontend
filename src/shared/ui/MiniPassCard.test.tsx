import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { MiniPassCard } from './MiniPassCard'

test('MiniPassCard: 장식이라 스크린 리더에 읽히지 않는다', () => {
  const { container } = render(<MiniPassCard caption="첫 달 할인" />)

  expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  expect(container).toHaveTextContent('동탄고 패스')
  expect(container).toHaveTextContent('첫 달 할인')
})

test('MiniPassCard: 뒤 카드는 문구를 쓰지 않고 한 톤 밝은 바탕이다', () => {
  const { container: front } = render(<MiniPassCard caption="첫 달 할인" />)
  const { container: back } = render(<MiniPassCard layer="back" caption="첫 달 할인" />)

  expect(back).not.toHaveTextContent('첫 달 할인')
  expect(back.firstElementChild?.className).toContain('#2A4F86')
  expect(front.firstElementChild?.className).not.toContain('#2A4F86')
  // 강조(노란) 링은 앞 카드에만 있다.
  expect(front.querySelectorAll('circle[stroke="rgba(255,212,92,.5)"]')).toHaveLength(1)
  expect(back.querySelectorAll('circle[stroke="rgba(255,212,92,.5)"]')).toHaveLength(0)
})

test('MiniPassCard: 감싼 칸의 폭을 채우고, 안쪽 그림의 기준이 되도록 relative다', () => {
  const { container } = render(<MiniPassCard className="mt-2" />)

  expect(container.firstElementChild).toHaveClass('relative', 'w-full', 'mt-2')
})
