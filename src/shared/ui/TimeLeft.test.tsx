import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { TimeLeft } from './TimeLeft'

function bar(container: HTMLElement) {
  return container.querySelector('i')
}

test('TimeLeft: 남은 일수를 보여주고 전체 기간에 대한 비율로 막대를 채운다', () => {
  const { container } = render(<TimeLeft daysLeft={15} totalDays={30} />)

  expect(screen.getByText('15일')).toBeInTheDocument()
  expect(bar(container)).toHaveStyle({ width: '50%' })
})

test.each([
  [8, 'bg-night'],
  [7, 'bg-red'],
  [0, 'bg-red'],
])('TimeLeft: %i일 남으면 막대가 %s', (daysLeft, color) => {
  const { container } = render(<TimeLeft daysLeft={daysLeft} totalDays={31} />)

  expect(bar(container)).toHaveClass(color)
})

test('TimeLeft: 막대는 0%에서 100% 사이로 자른다', () => {
  const { container: over } = render(<TimeLeft daysLeft={40} totalDays={31} />)
  const { container: under } = render(<TimeLeft daysLeft={-2} totalDays={31} />)

  expect(bar(over)).toHaveStyle({ width: '100%' })
  expect(bar(under)).toHaveStyle({ width: '0%' })
  expect(under).toHaveTextContent('0일')
})

test('TimeLeft: 전체 기간이 0이면 막대를 비운다', () => {
  const { container: none } = render(<TimeLeft daysLeft={0} totalDays={0} />)
  const { container: some } = render(<TimeLeft daysLeft={5} totalDays={0} />)

  expect(bar(none)).toHaveStyle({ width: '0%' })
  expect(bar(some)).toHaveStyle({ width: '0%' })
})

test('TimeLeft: 막대는 장식이라 읽히지 않는다', () => {
  const { container } = render(<TimeLeft daysLeft={10} totalDays={31} />)

  expect(bar(container)?.parentElement).toHaveAttribute('aria-hidden', 'true')
})
