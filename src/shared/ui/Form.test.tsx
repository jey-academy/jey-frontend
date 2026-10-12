import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FormEvent } from 'react'
import { expect, test, vi } from 'vitest'
import { loseFocus } from '@/test/focus'
import { Form } from './Form'

function Sample({ saving, onSubmit }: { saving: boolean; onSubmit?: () => void }) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit?.()
  }
  return (
    <Form saving={saving} onSubmit={handleSubmit} aria-label="학부모 추가" className="grid gap-4">
      <select aria-label="관계" defaultValue="MOTHER">
        <option value="MOTHER">어머니</option>
        <option value="FATHER">아버지</option>
      </select>
      <input aria-label="이름" required />
      <button type="button">취소</button>
      <button type="submit">저장</button>
    </Form>
  )
}

test('저장하는 동안에는 안의 입력칸과 버튼이 모두 막힌다', () => {
  const { rerender } = render(<Sample saving={false} />)
  for (const name of ['관계', '이름']) expect(screen.getByLabelText(name)).toBeEnabled()
  for (const name of ['취소', '저장']) expect(screen.getByRole('button', { name })).toBeEnabled()

  rerender(<Sample saving />)

  for (const name of ['관계', '이름']) expect(screen.getByLabelText(name)).toBeDisabled()
  for (const name of ['취소', '저장']) expect(screen.getByRole('button', { name })).toBeDisabled()
})

test('저장이 끝나면 포커스를 있던 칸으로 돌려놓는다', async () => {
  const { rerender } = render(<Sample saving={false} />)
  await userEvent.click(screen.getByLabelText('이름'))

  rerender(<Sample saving />)
  loseFocus()
  rerender(<Sample saving={false} />)

  expect(screen.getByLabelText('이름')).toHaveFocus()
})

test('칸에서 Enter를 누르면 보낸다. 브라우저의 입력값 검사는 거치지 않는다', async () => {
  const onSubmit = vi.fn()
  render(<Sample saving={false} onSubmit={onSubmit} />)

  // 이름이 비어 있다(required). 브라우저 검사를 켜 두면 여기서 막혀 폼의 검사가 돌지 않는다.
  await userEvent.type(screen.getByLabelText('이름'), '{Enter}')

  expect(onSubmit).toHaveBeenCalledOnce()
  expect(screen.getByRole('form', { name: '학부모 추가' })).toHaveAttribute('novalidate')
})

test('저장하는 동안에는 Enter로도 다시 보내지 않는다', async () => {
  const onSubmit = vi.fn()
  const { rerender } = render(<Sample saving={false} onSubmit={onSubmit} />)
  rerender(<Sample saving onSubmit={onSubmit} />)

  // Form이 onSubmit을 막는 것이 아니다. 칸과 버튼이 막혀 있어 보낼 길이 없다.
  await userEvent.type(screen.getByLabelText('이름'), '{Enter}')
  await userEvent.click(screen.getByRole('button', { name: '저장' }))

  expect(onSubmit).not.toHaveBeenCalled()
})

test('form에 주는 속성은 그대로 전한다. 안의 것들은 폼의 격자에 그대로 놓인다', () => {
  render(<Sample saving={false} />)

  const form = screen.getByRole('form', { name: '학부모 추가' })
  expect(form).toHaveClass('grid', 'gap-4')
  // 묶는 요소가 상자를 만들면 칸들이 격자의 한 칸에 몰린다.
  expect(form.firstElementChild).toHaveClass('contents')
})
