import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { Segmented } from './Segmented'

const counts = [
  { value: '8', label: '8회' },
  { value: '9', label: '9회' },
  { value: '10', label: '10회' },
]

test('이름이 붙은 라디오 묶음으로 그리고 처음 값을 선택해 둔다', () => {
  render(<Segmented label="이번 달 수업 횟수" name="count" options={counts} defaultValue="9" />)

  expect(screen.getByRole('radiogroup', { name: '이번 달 수업 횟수' })).toBeInTheDocument()
  expect(screen.getAllByRole('radio')).toHaveLength(3)
  expect(screen.getByRole('radio', { name: '9회' })).toBeChecked()
  expect(screen.getByRole('radio', { name: '8회' })).not.toBeChecked()
})

test('처음 값을 주지 않으면 아무것도 선택돼 있지 않다', () => {
  render(<Segmented label="이번 달 수업 횟수" name="count" options={counts} />)

  for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
})

test('고르면 선택이 옮겨 가고 고른 값을 알려준다', async () => {
  const onChange = vi.fn()
  render(
    <Segmented
      label="이번 달 수업 횟수"
      name="count"
      options={counts}
      defaultValue="9"
      onChange={onChange}
    />,
  )

  await userEvent.click(screen.getByText('10회'))

  expect(screen.getByRole('radio', { name: '10회' })).toBeChecked()
  expect(screen.getByRole('radio', { name: '9회' })).not.toBeChecked()
  expect(onChange).toHaveBeenCalledExactlyOnceWith('10')
})

test('방향키로 선택을 옮길 수 있다', async () => {
  const onChange = vi.fn()
  render(
    <Segmented
      label="이번 달 수업 횟수"
      name="count"
      options={counts}
      defaultValue="8"
      onChange={onChange}
    />,
  )

  await userEvent.tab()
  expect(screen.getByRole('radio', { name: '8회' })).toHaveFocus()

  await userEvent.keyboard('{ArrowRight}')

  expect(screen.getByRole('radio', { name: '9회' })).toBeChecked()
  expect(onChange).toHaveBeenCalledExactlyOnceWith('9')
})

test('value를 주면 바깥에서 정한 값만 선택된다', async () => {
  function Controlled() {
    const [count, setCount] = useState('9')
    return (
      <>
        <Segmented
          label="이번 달 수업 횟수"
          name="count"
          options={counts}
          value={count}
          onChange={setCount}
        />
        <output>선택: {count}</output>
      </>
    )
  }
  render(<Controlled />)

  await userEvent.click(screen.getByText('8회'))

  expect(screen.getByRole('radio', { name: '8회' })).toBeChecked()
  expect(screen.getByText('선택: 8')).toBeInTheDocument()
})

test('value를 줬는데 바깥에서 값을 바꾸지 않으면 선택이 옮겨 가지 않는다', async () => {
  render(
    <Segmented
      label="이번 달 수업 횟수"
      name="count"
      options={counts}
      value="9"
      onChange={() => {}}
    />,
  )

  await userEvent.click(screen.getByText('10회'))

  expect(screen.getByRole('radio', { name: '9회' })).toBeChecked()
})

test('폼으로 제출하면 고른 값이 name으로 실린다', async () => {
  render(
    <form aria-label="등록">
      <Segmented label="이번 달 수업 횟수" name="count" options={counts} defaultValue="9" />
    </form>,
  )

  await userEvent.click(screen.getByText('10회'))

  const form = screen.getByRole('form', { name: '등록' }) as HTMLFormElement
  expect(new FormData(form).get('count')).toBe('10')
})

test('비활성이면 고를 수 없다', async () => {
  const onChange = vi.fn()
  render(
    <Segmented
      label="이번 달 수업 횟수"
      name="count"
      options={counts}
      defaultValue="9"
      onChange={onChange}
      disabled
    />,
  )

  await userEvent.click(screen.getByText('10회'))

  expect(screen.getByRole('radio', { name: '9회' })).toBeChecked()
  expect(onChange).not.toHaveBeenCalled()
})

test('도움말과 에러는 묶음의 설명으로 이어지고, 에러가 있으면 도움말 대신 보여준다', () => {
  const { rerender } = render(
    <Segmented label="역할" name="role" options={counts} hint="나중에 바꿀 수 있어요." />,
  )
  const group = screen.getByRole('radiogroup', { name: '역할' })
  expect(group).toHaveAccessibleDescription('나중에 바꿀 수 있어요.')
  expect(group).not.toHaveAttribute('aria-invalid')

  rerender(
    <Segmented
      label="역할"
      name="role"
      options={counts}
      hint="나중에 바꿀 수 있어요."
      error="바꿀 수 없는 역할이에요."
    />,
  )

  expect(group).toBeInvalid()
  expect(group).toHaveAccessibleDescription('바꿀 수 없는 역할이에요.')
  expect(screen.queryByText('나중에 바꿀 수 있어요.')).not.toBeInTheDocument()
})

test('도움말도 에러도 없으면 설명을 달지 않는다', () => {
  render(<Segmented label="역할" name="role" options={counts} />)

  const group = screen.getByRole('radiogroup', { name: '역할' })
  expect(group).not.toHaveAttribute('aria-describedby')
  expect(group).not.toHaveAttribute('aria-invalid')
})
