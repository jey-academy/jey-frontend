import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { SearchBox } from './SearchBox'

function Harness({
  onSubmit = () => {},
  busy = false,
}: {
  onSubmit?: (value: string) => void
  busy?: boolean
}) {
  const [value, setValue] = useState('')
  return (
    <SearchBox
      label="패스 번호"
      value={value}
      onValueChange={setValue}
      onSubmit={() => onSubmit(value)}
      submitLabel="확인하기"
      busy={busy}
      busyLabel="확인하는 중"
      placeholder="패스 번호 (예: DT-7KQ4MX)"
      hint="QR 스캐너를 연결했다면 이 칸에 바로 찍으면 돼요."
      extraActions={<button type="button">QR 찍기</button>}
      autoFocus
    />
  )
}

test('SearchBox: 이름이 붙은 검색 영역과 입력 칸, 도움말, 버튼을 그리고 입력 칸에 포커스한다', () => {
  render(<Harness />)

  expect(screen.getByRole('search', { name: '패스 번호' })).toBeInTheDocument()
  const input = screen.getByRole('textbox', { name: '패스 번호' })
  expect(input).toHaveFocus()
  expect(input).toHaveAccessibleDescription('QR 스캐너를 연결했다면 이 칸에 바로 찍으면 돼요.')
  expect(input).toHaveAttribute('placeholder', '패스 번호 (예: DT-7KQ4MX)')
  expect(input).toHaveAttribute('autocomplete', 'off')
  expect(screen.getByRole('button', { name: 'QR 찍기' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '확인하기' })).toHaveAttribute('type', 'submit')
})

test('SearchBox: Enter와 버튼 모두 지금 값으로 확인한다', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(<Harness onSubmit={onSubmit} />)

  await user.type(screen.getByRole('textbox'), 'DT-ABC234{Enter}')
  expect(onSubmit).toHaveBeenLastCalledWith('DT-ABC234')

  await user.click(screen.getByRole('button', { name: '확인하기' }))
  expect(onSubmit).toHaveBeenCalledTimes(2)
})

test('SearchBox: 확인하는 중에는 버튼을 막고 Enter도 무시하지만, 입력 칸은 막지 않는다', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(<Harness onSubmit={onSubmit} busy />)

  expect(screen.getByRole('button', { name: '확인하는 중' })).toBeDisabled()
  const input = screen.getByRole('textbox')
  expect(input).toBeEnabled()
  await user.type(input, 'DT{Enter}')
  expect(input).toHaveValue('DT')
  expect(onSubmit).not.toHaveBeenCalled()
})

test('SearchBox: 도움말이 없으면 설명을 잇지 않는다', () => {
  render(
    <SearchBox
      label="검색"
      value=""
      onValueChange={() => {}}
      onSubmit={() => {}}
      submitLabel="찾기"
    />,
  )

  expect(screen.getByRole('textbox', { name: '검색' })).not.toHaveAttribute('aria-describedby')
  expect(screen.getByRole('textbox')).not.toHaveFocus()
})
