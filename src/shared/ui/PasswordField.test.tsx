import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { expect, test } from 'vitest'
import { Form } from './Form'
import { PasswordField } from './PasswordField'

// 이름표·도움말·에러의 규칙은 fieldContract.test.tsx가 TextField, SelectField와 함께 본다. 여기서는 보기 버튼만 본다.

test('평소에는 가려 두고, 보기를 누르면 친 값을 보여준다. 가리기를 누르면 다시 가린다', async () => {
  render(<PasswordField label="새 비밀번호" defaultValue="secret-value" />)
  const input = screen.getByLabelText('새 비밀번호')
  expect(input).toHaveAttribute('type', 'password')

  const show = screen.getByRole('button', { name: '새 비밀번호 보기' })
  expect(show).toHaveTextContent('보기')
  await userEvent.click(show)

  expect(input).toHaveAttribute('type', 'text')
  expect(input).toHaveValue('secret-value')
  // 버튼의 이름이 보이는 글자와 같이 바뀐다.
  const hide = screen.getByRole('button', { name: '새 비밀번호 가리기' })
  expect(hide).toHaveTextContent('가리기')
  expect(screen.queryByRole('button', { name: '새 비밀번호 보기' })).not.toBeInTheDocument()

  await userEvent.click(hide)

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

test('저장하는 동안에는 입력창과 보기 버튼이 함께 막힌다', () => {
  render(
    <Form saving>
      <PasswordField label="새 비밀번호" />
    </Form>,
  )

  expect(screen.getByLabelText('새 비밀번호')).toBeDisabled()
  expect(screen.getByRole('button', { name: '새 비밀번호 보기' })).toBeDisabled()
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
  // 보이는 동안에도 맞춤법 검사와 자동 대문자는 꺼져 있다.
  expect(input).toHaveAttribute('spellcheck', 'false')
  expect(input).toHaveAttribute('autocapitalize', 'none')
})

test('ref로 입력창을 잡아 포커스를 줄 수 있다', () => {
  const ref = createRef<HTMLInputElement>()
  render(<PasswordField label="새 비밀번호" ref={ref} />)

  ref.current?.focus()

  expect(screen.getByLabelText('새 비밀번호')).toHaveFocus()
})
