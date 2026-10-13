import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { PasswordField } from './PasswordField'

test('평소에는 가려 두고, 보기를 누르면 친 값을 보여준다. 다시 누르면 가린다', async () => {
  render(<PasswordField label="새 비밀번호" defaultValue="secret-value" />)
  const input = screen.getByLabelText('새 비밀번호')
  const toggle = screen.getByRole('button', { name: '새 비밀번호 보기' })
  expect(input).toHaveAttribute('type', 'password')
  expect(toggle).toHaveAttribute('aria-pressed', 'false')
  expect(toggle).toHaveTextContent('보기')

  await userEvent.click(toggle)

  expect(input).toHaveAttribute('type', 'text')
  expect(input).toHaveValue('secret-value')
  // 이름은 그대로 두고 눌린 상태로 알린다.
  expect(toggle).toHaveAccessibleName('새 비밀번호 보기')
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
  expect(toggle).toHaveTextContent('가리기')

  await userEvent.click(toggle)

  expect(input).toHaveAttribute('type', 'password')
})

test('보기 버튼은 폼을 제출하지 않는다', async () => {
  let submitted = 0
  render(
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submitted += 1
      }}
    >
      <PasswordField label="새 비밀번호" />
    </form>,
  )

  await userEvent.click(screen.getByRole('button', { name: '새 비밀번호 보기' }))

  expect(submitted).toBe(0)
})

test('도움말과 에러는 입력창의 설명으로 이어지고, 에러가 있으면 도움말 대신 보여준다', () => {
  const { rerender } = render(<PasswordField label="새 비밀번호" hint="10자 이상" />)
  const input = screen.getByLabelText('새 비밀번호')
  expect(input).toHaveAccessibleDescription('10자 이상')
  expect(input).not.toHaveAttribute('aria-invalid')

  rerender(<PasswordField label="새 비밀번호" hint="10자 이상" error="너무 짧아요." />)

  expect(input).toBeInvalid()
  expect(input).toHaveAccessibleDescription('너무 짧아요.')
  expect(screen.queryByText('10자 이상')).not.toBeInTheDocument()
})

test('입력하면 onChange로 값을 알리고, 넘겨준 속성은 입력창에 붙는다', async () => {
  const typed: string[] = []
  render(
    <PasswordField
      label="새 비밀번호"
      name="password"
      autoComplete="new-password"
      onChange={(event) => typed.push(event.target.value)}
    />,
  )
  const input = screen.getByLabelText('새 비밀번호')

  await userEvent.type(input, 'ab')

  expect(typed).toEqual(['a', 'ab'])
  expect(input).toHaveAttribute('name', 'password')
  expect(input).toHaveAttribute('autocomplete', 'new-password')
})
