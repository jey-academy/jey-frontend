import { within } from '@testing-library/react'
import { expect } from 'vitest'

/**
 * 줄을 쌓는 표(`Table`의 `stack`)에서 칸의 이름표가 같은 열의 머리 글자와 맞는지 본다.
 * 좁은 화면에서는 머리 줄이 숨어 이름표만 보이므로, 열 순서를 바꾸고 이름표를 그대로 두면 값에 다른 이름이 붙는다.
 * 첫 칸은 카드의 제목이라 이름표가 없고, 버튼이 든 칸도 이름표가 없다. 그 밖의 칸은 머리 글자와 같은 이름표가 있어야 한다.
 */
export function expectStackLabels(table: HTMLElement) {
  const headers = within(table)
    .getAllByRole('columnheader')
    .map((header) => header.textContent)
  const [, ...rows] = within(table).getAllByRole('row')
  expect(rows.length).toBeGreaterThan(0)

  for (const row of rows) {
    const cells = within(row).getAllByRole('cell')
    const labels = cells.map((cell) => cell.getAttribute('data-label'))
    const expected = cells.map((cell, index) =>
      index === 0 || within(cell).queryAllByRole('button').length > 0 ? null : headers[index],
    )
    expect(labels).toEqual(expected)
  }
}
