import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { useRefocusAfter } from './useRefocusAfter'

/** 저장하는 동안 입력칸을 막는 폼. `mounted`를 끄면 폼이 사라진다(저장에 성공해 닫힌 경우). */
function Form({ saving, mounted = true }: { saving: boolean; mounted?: boolean }) {
  const refocus = useRefocusAfter(saving)
  return (
    <>
      <button type="button">바깥 버튼</button>
      {mounted && (
        <form {...refocus}>
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

/**
 * 브라우저는 포커스가 있던 칸이 막히면 포커스를 치운다(body로 간다).
 * jsdom은 막힌 칸에 그대로 두고 blur도 듣지 않는다. body로 직접 옮겨 흉내 낸다.
 */
function loseFocus() {
  document.body.tabIndex = -1
  document.body.focus()
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

test('저장 버튼을 눌러 시작했으면 저장 버튼으로 돌려놓는다', async () => {
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
  rerender(<Form saving />)
  rerender(<Form saving={false} />)

  expect(screen.getByLabelText('휴대전화')).toHaveFocus()
})
