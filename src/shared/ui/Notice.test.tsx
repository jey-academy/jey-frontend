import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Notice } from './Notice'

test('기본은 에러 안내다. 나타나는 순간 바로 읽어 준다', () => {
  render(<Notice>패스를 찾을 수 없어요.</Notice>)

  expect(screen.getByRole('alert')).toHaveTextContent('패스를 찾을 수 없어요.')
})

test('끝난 일을 알릴 때는 하던 말을 끊지 않는 status로 그린다', () => {
  render(<Notice tone="success">학생을 등록했어요.</Notice>)

  expect(screen.getByRole('status')).toHaveTextContent('학생을 등록했어요.')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('확인이 필요한 일을 알릴 때는 경고 색으로, 하던 말을 끊지 않는 status로 그린다', () => {
  render(<Notice tone="warning">다른 사람이라면 연결을 끊어 주세요.</Notice>)

  const notice = screen.getByRole('status')
  expect(notice).toHaveTextContent('다른 사람이라면 연결을 끊어 주세요.')
  expect(notice).toHaveClass('bg-warn-bg', 'text-warn')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('요청 번호를 주면 안내 아래에 문의할 때 쓸 번호로 보여준다', () => {
  render(<Notice requestId="2d6a6e90a9d04a16bb607aa43840f2d7">일시적인 문제가 생겼어요.</Notice>)

  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent('일시적인 문제가 생겼어요.')
  expect(alert).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 2d6a6e90a9d04a16bb607aa43840f2d7',
  )
})

test.each([[null], [undefined], ['']])(
  '요청 번호가 없으면(%s) 그 줄을 그리지 않는다',
  (requestId) => {
    render(<Notice requestId={requestId}>일시적인 문제가 생겼어요.</Notice>)

    expect(screen.getByRole('alert').textContent).toBe('일시적인 문제가 생겼어요.')
  },
)
