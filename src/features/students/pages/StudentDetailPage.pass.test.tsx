import { screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { setupMockApi } from '@/test/mockApi'
import { admin, renderApp, staff } from '@/test/renderApp'
import { doyun, mockDetail, PATH } from './studentDetailFixtures'

setupMockApi()

// 학생 상세의 제이G패스 카드(관리자만). 발급과 목록은 패스 화면으로 주소만 넘긴다.

function passCard() {
  return screen.getByRole('heading', { level: 2, name: '제이G패스' }).parentElement as HTMLElement
}

test('관리자는 재원생에게 패스를 발급하거나 받은 패스를 보러 갈 수 있다', async () => {
  mockDetail()
  renderApp(PATH, { me: admin })

  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  expect(within(passCard()).getByRole('link', { name: '패스 발급' })).toHaveAttribute(
    'href',
    '/admin/passes/new?studentId=1',
  )
  expect(within(passCard()).getByRole('link', { name: '받은 패스 보기' })).toHaveAttribute(
    'href',
    '/admin/passes?studentId=1',
  )
})

test('퇴원한 학생에게는 발급 버튼 없이 까닭을 보여 주고, 받은 패스는 볼 수 있다', async () => {
  mockDetail({ ...doyun, status: 'WITHDRAWN' })
  renderApp(PATH, { me: admin })

  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  expect(passCard()).toHaveTextContent('퇴원한 학생에게는 패스를 발급할 수 없어요.')
  expect(within(passCard()).queryByRole('link', { name: '패스 발급' })).not.toBeInTheDocument()
  expect(within(passCard()).getByRole('link', { name: '받은 패스 보기' })).toBeInTheDocument()
})

test('직원에게는 패스 카드가 없다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })

  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  expect(screen.queryByRole('heading', { name: '제이G패스' })).not.toBeInTheDocument()
})
