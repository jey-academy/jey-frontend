import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Table, Td, Th } from './Table'

function renderTable() {
  render(
    <Table caption="반·수강료표">
      <thead>
        <tr>
          <Th>반</Th>
          <Th numeric>수강료</Th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <Td>중1 정규</Td>
          <Td numeric>280,000원</Td>
        </tr>
      </tbody>
    </Table>,
  )
}

test('caption이 표의 이름이 된다', () => {
  renderTable()

  expect(screen.getByRole('table', { name: '반·수강료표' })).toBeInTheDocument()
})

test('머리 칸은 열 머리로, 내용 칸은 칸으로 읽힌다', () => {
  renderTable()

  const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)
  expect(headers).toEqual(['반', '수강료'])
  const row = screen.getByRole('row', { name: /중1 정규/ })
  expect(within(row).getAllByRole('cell')).toHaveLength(2)
})
