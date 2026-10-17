import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { requests, setupMockApi } from '@/test/mockApi'
import { renderApp } from '@/test/renderApp'

setupMockApi()

function choices() {
  return within(screen.getByRole('navigation', { name: '들어갈 화면' }))
}

test('제목, 소개 한 줄, 선택 카드 두 개를 보여 주고 서버에 묻지 않는다', () => {
  renderApp('/', { me: null })

  expect(
    screen.getByRole('heading', { level: 1, name: '새 학원 첫 달, 할인으로 시작해요' }),
  ).toBeInTheDocument()
  expect(
    screen.getByText('동탄 연계 학원과 JEY 어학원이 서로 주는 할인 패스예요.'),
  ).toBeInTheDocument()

  const links = choices().getAllByRole('link')
  expect(links).toHaveLength(2)
  // 이름은 제목만, 설명은 따로 읽힌다.
  expect(links[0]).toHaveAccessibleName('패스 링크 다시 받기')
  expect(links[0]).toHaveAccessibleDescription(
    '학부모·학생. 학생 이름과 학부모 번호로 새 링크를 받아요',
  )
  expect(links[0]).toHaveAttribute('href', '/find')
  expect(links[1]).toHaveAccessibleName('학원 직원 로그인')
  expect(links[1]).toHaveAttribute('href', '/login')

  expect(requests()).toEqual([])
})

test('패스는 양방향이라 할인율 숫자와 학원 한쪽만 가리키는 문구를 쓰지 않는다', () => {
  renderApp('/', { me: null })

  expect(document.body).not.toHaveTextContent(/\d+\s*%/)
  // 카드 그림은 장식이다. 스크린 리더는 읽지 않는다.
  for (const caption of screen.getAllByText('첫 달 할인')) {
    expect(caption.closest('[aria-hidden="true"]')).not.toBeNull()
  }
})

test('패스 링크 다시 받기를 누르면 링크 다시 받기 화면으로 간다', async () => {
  const user = userEvent.setup()
  renderApp('/', { me: null })

  await user.click(choices().getByRole('link', { name: '패스 링크 다시 받기' }))

  expect(
    await screen.findByRole('heading', { level: 1, name: '링크 다시 받기' }),
  ).toBeInTheDocument()
})

test('학원 직원 로그인을 누르면 로그인 화면으로 간다', async () => {
  const user = userEvent.setup()
  renderApp('/', { me: null })

  await user.click(choices().getByRole('link', { name: '학원 직원 로그인' }))

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
})
