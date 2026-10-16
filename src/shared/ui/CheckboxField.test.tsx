import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { CheckboxField } from './CheckboxField'

test('이름표를 눌러도 칸이 바뀐다', async () => {
  const onChange = vi.fn()
  render(<CheckboxField label="동의를 받았어요" onChange={onChange} />)

  await userEvent.click(screen.getByText('동의를 받았어요'))

  expect(screen.getByRole('checkbox', { name: '동의를 받았어요' })).toBeChecked()
  expect(onChange).toHaveBeenCalledOnce()
})

test('도움말을 칸의 설명으로 잇는다', () => {
  render(<CheckboxField label="동의를 받았어요" hint="체크해야 발급할 수 있어요." />)

  expect(screen.getByRole('checkbox')).toHaveAccessibleDescription('체크해야 발급할 수 있어요.')
  expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-invalid')
})

test('에러가 있으면 도움말 대신 에러를 잇고 에러 상태로 알린다', () => {
  render(<CheckboxField label="동의를 받았어요" hint="도움말" error="동의를 확인해 주세요." />)

  const checkbox = screen.getByRole('checkbox')
  expect(checkbox).toHaveAccessibleDescription('동의를 확인해 주세요.')
  expect(checkbox).toHaveAttribute('aria-invalid', 'true')
  expect(screen.queryByText('도움말')).not.toBeInTheDocument()
})

test('막혀 있으면 눌러도 바뀌지 않는다', async () => {
  render(<CheckboxField label="동의를 받았어요" disabled />)

  await userEvent.click(screen.getByText('동의를 받았어요'))

  expect(screen.getByRole('checkbox')).not.toBeChecked()
})
