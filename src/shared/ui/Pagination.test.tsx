import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Pagination } from './Pagination'

test('지금 페이지를 1부터 세어 보여주고, 화면 낭독기에는 문장으로 알린다', () => {
  render(<Pagination page={1} totalPages={5} onChange={() => {}} />)

  const nav = screen.getByRole('navigation', { name: '페이지' })
  expect(nav).toHaveTextContent('2 / 5')
  expect(nav).toHaveTextContent('전체 5페이지 중 2페이지')
})

test('이전과 다음을 누르면 0부터 센 페이지 번호로 알린다', async () => {
  const onChange = vi.fn()
  render(<Pagination page={1} totalPages={5} onChange={onChange} />)

  await userEvent.click(screen.getByRole('button', { name: '다음' }))
  await userEvent.click(screen.getByRole('button', { name: '이전' }))

  expect(onChange.mock.calls).toEqual([[2], [0]])
})

test.each([
  ['첫 페이지에서는 이전을', 0, '이전', '다음'],
  ['마지막 페이지에서는 다음을', 4, '다음', '이전'],
])('%s 누를 수 없다', (_name, page, blocked, open) => {
  render(<Pagination page={page} totalPages={5} onChange={() => {}} />)

  expect(screen.getByRole('button', { name: blocked })).toBeDisabled()
  expect(screen.getByRole('button', { name: open })).toBeEnabled()
})

test('disabled면 둘 다 누를 수 없다', () => {
  render(<Pagination page={1} totalPages={5} onChange={() => {}} disabled />)

  expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
})

test.each([0, 1])('전체가 %i페이지면 아무것도 그리지 않는다', (totalPages) => {
  const { container } = render(<Pagination page={0} totalPages={totalPages} onChange={() => {}} />)

  expect(container).toBeEmptyDOMElement()
})
