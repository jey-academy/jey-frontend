import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { SummaryList } from './SummaryList'

test('이름표와 값을 줄마다 dt·dd로 보인다', () => {
  const { container } = render(
    <SummaryList
      items={[
        { label: '학생', value: '김하윤' },
        { label: '받을 금액', value: '299,250원' },
      ]}
    />,
  )

  const list = container.querySelector('dl')!
  expect(
    within(list)
      .getAllByRole('term')
      .map((term) => term.textContent),
  ).toEqual(['학생', '받을 금액'])
  expect(
    within(list)
      .getAllByRole('definition')
      .map((value) => value.textContent),
  ).toEqual(['김하윤', '299,250원'])
})

test('기본은 회색 상자, plain은 상자 없이 작은 글자다', () => {
  const { container, rerender } = render(<SummaryList items={[{ label: '가', value: '1' }]} />)
  expect(container.querySelector('dl')).toHaveClass('bg-field', 'rounded-md', 'text-[15px]')

  rerender(<SummaryList plain items={[{ label: '가', value: '1' }]} />)
  expect(container.querySelector('dl')).not.toHaveClass('bg-field')
  expect(container.querySelector('dl')).toHaveClass('text-[14px]')
})

test('strong 줄은 값을 크고 굵게 보인다', () => {
  render(
    <SummaryList
      items={[
        { label: '원래 수강료', value: '300,000원' },
        { label: '받을 금액', value: '285,000원', strong: true },
      ]}
    />,
  )

  const [normal, strong] = screen.getAllByRole('definition')
  expect(normal).toHaveClass('font-semibold')
  expect(normal).not.toHaveClass('font-extrabold')
  expect(strong).toHaveClass('font-extrabold', 'text-[17px]')
})
