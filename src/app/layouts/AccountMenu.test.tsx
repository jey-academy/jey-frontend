import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { setupMockApi } from '@/test/mockApi'
import { renderApp, staff } from '@/test/renderApp'

setupMockApi()

// jsdom은 CSS를 적용하지 않아 좁은 화면의 모양(버튼만 보이고 묶음은 숨김)은 흉내 내지 못한다.
// 열림 상태(aria-expanded)와, 좁은 화면에서 묶음을 숨기는 클래스가 붙고 빠지는 것으로 본다. 모양은 Chrome에서 확인했다.
const HIDDEN_ON_MOBILE = 'max-[560px]:hidden'

async function openPage() {
  renderApp('/desk/dongtanpass', { me: staff })
  const toggle = await screen.findByRole('button', { name: '이데스크 계정 메뉴' })
  const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
  if (!panel) throw new Error('펼칠 묶음이 없어요')
  return { toggle, panel }
}

test('이름 버튼을 누르면 비밀번호 변경과 로그아웃을 펼치고, 다시 누르면 접는다', async () => {
  const { toggle, panel } = await openPage()
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(panel).toHaveClass(HIDDEN_ON_MOBILE)
  expect(panel).toContainElement(screen.getByRole('button', { name: '로그아웃' }))
  expect(panel).toContainElement(screen.getByRole('link', { name: '비밀번호 변경' }))

  await userEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(panel).not.toHaveClass(HIDDEN_ON_MOBILE)

  await userEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(panel).toHaveClass(HIDDEN_ON_MOBILE)
})

test('Esc를 누르면 접고 포커스를 이름 버튼으로 돌려준다', async () => {
  const { toggle } = await openPage()
  await userEvent.click(toggle)
  screen.getByRole('link', { name: '비밀번호 변경' }).focus()

  await userEvent.keyboard('{Escape}')

  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(toggle).toHaveFocus()
})

test('바깥을 누르면 접고, 펼친 묶음 안을 누르면 그대로 둔다', async () => {
  const { toggle, panel } = await openPage()
  await userEvent.click(toggle)

  fireEvent.pointerDown(panel)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')

  fireEvent.pointerDown(screen.getByRole('main'))
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('비밀번호 변경으로 옮기면 접는다', async () => {
  const { toggle } = await openPage()
  await userEvent.click(toggle)

  await userEvent.click(screen.getByRole('link', { name: '비밀번호 변경' }))

  expect(
    await screen.findByRole('heading', { level: 1, name: '비밀번호 변경' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '이데스크 계정 메뉴' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})
