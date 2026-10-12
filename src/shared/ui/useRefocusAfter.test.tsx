import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { loseFocus } from '@/test/focus'
import { useRefocusAfter } from './useRefocusAfter'

/** 저장하는 동안 입력칸을 막는 폼. `mounted`를 끄면 폼이 사라진다(저장에 성공해 닫힌 경우). */
function Form({ saving, mounted = true }: { saving: boolean; mounted?: boolean }) {
  const refocus = useRefocusAfter(saving)
  return (
    <>
      <button type="button">바깥 버튼</button>
      {mounted && (
        <form {...refocus} onSubmit={(event) => event.preventDefault()}>
          <fieldset disabled={saving}>
            <input aria-label="이름" />
            <input aria-label="휴대전화" />
          </fieldset>
          <button type="submit" disabled={saving}>
            저장
          </button>
        </form>
      )}
    </>
  )
}

test('저장이 끝나면 포커스를 저장을 시작할 때 있던 칸으로 돌려놓는다', async () => {
  const { rerender } = render(<Form saving={false} />)
  await userEvent.click(screen.getByLabelText('휴대전화'))

  rerender(<Form saving />)
  loseFocus()
  expect(document.body).toHaveFocus()

  rerender(<Form saving={false} />)

  expect(screen.getByLabelText('휴대전화')).toHaveFocus()
})

test('저장을 시작할 때 포커스가 저장 버튼에 있었으면 저장 버튼으로 돌려놓는다', async () => {
  const { rerender } = render(<Form saving={false} />)
  await userEvent.click(screen.getByRole('button', { name: '저장' }))

  rerender(<Form saving />)
  loseFocus()
  rerender(<Form saving={false} />)

  expect(screen.getByRole('button', { name: '저장' })).toHaveFocus()
})

test('저장하는 동안 사용자가 다른 곳으로 옮긴 포커스는 빼앗지 않는다', async () => {
  const { rerender } = render(<Form saving={false} />)
  await userEvent.click(screen.getByLabelText('이름'))

  rerender(<Form saving />)
  await userEvent.click(screen.getByRole('button', { name: '바깥 버튼' }))
  rerender(<Form saving={false} />)

  expect(screen.getByRole('button', { name: '바깥 버튼' })).toHaveFocus()
})

test('저장에 성공해 폼이 사라졌으면 아무것도 하지 않는다', async () => {
  const { rerender } = render(<Form saving={false} />)
  await userEvent.click(screen.getByLabelText('이름'))

  rerender(<Form saving />)
  loseFocus()
  rerender(<Form saving={false} mounted={false} />)

  expect(document.body).toHaveFocus()
})

test('저장하지 않았으면 포커스를 옮기지 않는다', async () => {
  const { rerender } = render(<Form saving={false} />)
  await userEvent.click(screen.getByLabelText('이름'))
  loseFocus()

  rerender(<Form saving={false} />)

  expect(document.body).toHaveFocus()
})

test('저장을 거듭해도 그때마다 시작할 때의 칸으로 돌려놓는다', async () => {
  const { rerender } = render(<Form saving={false} />)
  await userEvent.click(screen.getByLabelText('이름'))
  rerender(<Form saving />)
  loseFocus()
  rerender(<Form saving={false} />)
  expect(screen.getByLabelText('이름')).toHaveFocus()

  await userEvent.click(screen.getByLabelText('휴대전화'))
  rerender(<Form saving />)
  loseFocus()
  rerender(<Form saving={false} />)

  expect(screen.getByLabelText('휴대전화')).toHaveFocus()
})

test('막힌 칸에 포커스가 남는 브라우저에서도 그 칸으로 돌려놓는다', async () => {
  const { rerender } = render(<Form saving={false} />)
  await userEvent.click(screen.getByLabelText('휴대전화'))

  // 포커스를 치우지 않는다. jsdom처럼 막힌 칸이 activeElement로 남는 경우다.
  // 훅이 포커스를 엉뚱한 곳으로 옮기지 않는지를 본다(이 경우는 훅이 없어도 그 칸에 남는다).
  rerender(<Form saving />)
  expect(screen.getByLabelText('휴대전화')).toHaveFocus()
  rerender(<Form saving={false} />)

  expect(screen.getByLabelText('휴대전화')).toHaveFocus()
})

test('포커스가 그 칸을 품은 요소에 있으면 돌려놓는다', async () => {
  // 브라우저가 닫은 창을 다시 열면, 칸이 모두 막혀 있어 포커스가 창 자체에 놓인다.
  function InDialog({ saving }: { saving: boolean }) {
    const refocus = useRefocusAfter(saving)
    return (
      <div role="dialog" aria-label="창" tabIndex={-1}>
        <form {...refocus}>
          <fieldset disabled={saving}>
            <input aria-label="이름" />
          </fieldset>
        </form>
      </div>
    )
  }
  const { rerender } = render(<InDialog saving={false} />)
  await userEvent.click(screen.getByLabelText('이름'))

  rerender(<InDialog saving />)
  screen.getByRole('dialog').focus()
  expect(screen.getByRole('dialog')).toHaveFocus()
  rerender(<InDialog saving={false} />)

  expect(screen.getByLabelText('이름')).toHaveFocus()
})

test('포커스를 돌려놓을 때 화면을 움직이지 않는다', async () => {
  const { rerender } = render(<Form saving={false} />)
  const phone = screen.getByLabelText('휴대전화')
  await userEvent.click(phone)
  const focus = vi.spyOn(phone, 'focus')

  rerender(<Form saving />)
  loseFocus()
  rerender(<Form saving={false} />)

  // 긴 화면에서 위쪽 칸으로 돌아갈 때 화면이 따라 올라가면, 버튼 위의 실패 안내가 밀려난다.
  expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
})
