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

test('표 안의 숨긴 글자가 가로 스크롤 밖으로 나가지 않게, 스크롤하는 묶음이 위치의 기준이 된다', () => {
  render(
    <Table caption="할인 유형">
      <thead>
        <tr>
          <Th>이름</Th>
          <Th>
            <span className="sr-only">수정</span>
          </Th>
        </tr>
      </thead>
    </Table>,
  )

  // jsdom은 배치를 계산하지 않아 넘침 자체는 볼 수 없다. 넘침을 막는 조건(가로로 스크롤하는 묶음이 기준 요소)을 본다.
  // 숨긴 글자는 absolute라, 이 묶음이 기준이 아니면 페이지를 넓힌다. 실제 넘침은 브라우저에서 확인한다.
  const scroller = screen.getByRole('table', { name: '할인 유형' }).parentElement
  expect(scroller).toHaveClass('overflow-x-auto', 'relative')
  // 열의 머리글은 화면에 보이지 않아도 이름으로 읽힌다.
  expect(screen.getByRole('columnheader', { name: '수정' })).toBeInTheDocument()
})

function renderStackable(stack: boolean) {
  render(
    <Table caption="할인 유형" stack={stack}>
      <thead>
        <tr>
          <Th>이름</Th>
          <Th>할인율</Th>
          <Th>
            <span className="sr-only">수정</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <Td>형제</Td>
          <Td label="할인율" numeric>
            10%
          </Td>
          <Td actions>
            <button type="button">수정</button>
          </Td>
        </tr>
      </tbody>
    </Table>,
  )
  return screen.getAllByRole('cell')
}

test('줄을 쌓는 표에서는 칸마다 이름표를 속성으로 달고, 좁은 화면에서만 칸 앞에 그린다', () => {
  const [title, rate] = renderStackable(true)

  // 이름표는 CSS(::before)로 그린다. 칸의 글자는 그대로라 칸 글자로 찾는 쪽이 바뀌지 않는다.
  expect(rate).toHaveAttribute('data-label', '할인율')
  expect(rate).toHaveTextContent(/^10%$/)
  expect(rate).toHaveClass('max-[560px]:before:content-[attr(data-label)]', 'max-[560px]:block')
  // 이름표가 없는 첫 칸은 카드의 제목이다.
  expect(title).not.toHaveAttribute('data-label')
  // 좁은 화면에서는 표를 블록으로 바꾸고 머리 줄을 숨긴다(이름표가 대신한다). 가로 최소 폭도 푼다.
  const table = screen.getByRole('table', { name: '할인 유형' })
  expect(table).toHaveClass(
    'max-[560px]:block',
    'max-[560px]:min-w-0',
    'max-[560px]:[&_thead]:hidden',
  )
})

test('쌓지 않는 표에서는 이름표를 달지 않고 넓은 표 모양 그대로다', () => {
  const [, rate] = renderStackable(false)

  expect(rate).not.toHaveAttribute('data-label')
  expect(rate.className).not.toMatch(/max-\[560px\]/)
  expect(screen.getByRole('table', { name: '할인 유형' }).className).not.toMatch(/max-\[560px\]/)
})

test('버튼 칸은 버튼을 오른쪽에 모으고, 줄을 쌓으면 카드 아래 왼쪽에 두어 넘치면 다음 줄로 보낸다', () => {
  const actions = renderStackable(true)[2]

  const group = within(actions).getByRole('button', { name: '수정' }).parentElement
  expect(group).toHaveClass(
    'flex',
    'justify-end',
    'max-[560px]:justify-start',
    'max-[560px]:flex-wrap',
  )
  expect(actions).not.toHaveAttribute('data-label')
})

test('다시 받는 중이면 표를 흐리게 하고 바쁘다고 알린다. 흐려지기까지 틈을 두어 금방 끝나면 깜빡이지 않는다', () => {
  const { rerender } = render(
    <Table caption="할인 유형" refreshing>
      <tbody />
    </Table>,
  )
  const scroller = screen.getByRole('table', { name: '할인 유형' }).parentElement
  expect(scroller).toHaveAttribute('aria-busy', 'true')
  // delay-500: 0.5초가 지나야 흐려지기 시작한다. 그 전에 끝나면 흐려지지 않는다.
  expect(scroller).toHaveClass('opacity-60', 'transition-opacity', 'delay-500')

  rerender(
    <Table caption="할인 유형">
      <tbody />
    </Table>,
  )

  // 끝나면 틈 없이 바로 또렷해진다(지연을 건 클래스가 함께 빠진다).
  expect(scroller).not.toHaveAttribute('aria-busy')
  expect(scroller).not.toHaveClass('opacity-60')
  expect(scroller).not.toHaveClass('delay-500')
})
