import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { expect, test, vi } from 'vitest'
import { PeriodFields, type PeriodFieldsHandle } from './PeriodFields'

const labels = { from: '발급일 시작', to: '발급일 끝' }

test('이름표가 붙은 날짜 칸 두 개를 받는 범위와 함께 그린다', () => {
  render(<PeriodFields labels={labels} value={{ from: '2026-10-01', to: '' }} onChange={vi.fn()} />)

  const from = screen.getByLabelText('발급일 시작')
  const to = screen.getByLabelText('발급일 끝')
  for (const input of [from, to]) {
    expect(input).toHaveAttribute('type', 'date')
    expect(input).toHaveAttribute('min', '2000-01-01')
    expect(input).toHaveAttribute('max', '2099-12-31')
  }
  expect(from).toHaveAttribute('name', 'from')
  expect(to).toHaveAttribute('name', 'to')
  expect(from).toHaveValue('2026-10-01')
  expect(to).toHaveValue('')
})

test('한 칸을 바꾸면 다른 칸 값은 그대로 둔 기간을 알린다', () => {
  const onChange = vi.fn()
  render(
    <PeriodFields
      labels={labels}
      value={{ from: '2026-10-01', to: '2026-10-31' }}
      onChange={onChange}
    />,
  )

  fireEvent.change(screen.getByLabelText('발급일 끝'), { target: { value: '2026-11-30' } })
  expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-11-30' })

  fireEvent.change(screen.getByLabelText('발급일 시작'), { target: { value: '2026-09-01' } })
  expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-10-31' })
})

test('오류는 그 칸에 붙인다', () => {
  render(
    <PeriodFields
      labels={labels}
      value={{ from: '2026-10-02', to: '2026-10-01' }}
      onChange={vi.fn()}
      errors={{ to: '끝일이 시작일보다 앞이에요.' }}
    />,
  )

  expect(screen.getByLabelText('발급일 시작')).toBeValid()
  expect(screen.getByLabelText('발급일 끝')).toBeInvalid()
  expect(screen.getByLabelText('발급일 끝')).toHaveAccessibleDescription(
    '끝일이 시작일보다 앞이에요.',
  )
})

test('ref로 칸마다 날짜로 읽히지 않는 글자가 있는지 알려 준다', () => {
  const ref = createRef<PeriodFieldsHandle>()
  render(<PeriodFields ref={ref} labels={labels} value={{ from: '', to: '' }} onChange={vi.fn()} />)

  expect(ref.current?.badInput()).toEqual({ from: false, to: false })

  // 브라우저는 달력에 없는 날짜(02-30)나 넣다 만 날짜를 빈 값으로 주고 badInput만 켠다.
  Object.defineProperty(screen.getByLabelText('발급일 끝'), 'validity', {
    value: { badInput: true },
    configurable: true,
  })
  expect(ref.current?.badInput()).toEqual({ from: false, to: true })
})
