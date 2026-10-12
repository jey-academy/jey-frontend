import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { RequestIdLine } from './RequestIdLine'

test('문의할 때 쓸 번호를 한 줄로 보여준다. 문단 안에도 넣을 수 있다', () => {
  render(
    <p role="alert">
      로그인 상태를 확인하지 못했어요.
      <RequestIdLine requestId="2d6a6e90a9d04a16bb607aa43840f2d7" />
    </p>,
  )

  expect(screen.getByRole('alert')).toHaveTextContent(
    '로그인 상태를 확인하지 못했어요.문의할 때 이 번호를 알려 주세요: 2d6a6e90a9d04a16bb607aa43840f2d7',
  )
  // 문단(p) 안에 들어가도 되는 요소만 쓴다.
  expect(screen.getByRole('alert').querySelector('p, div')).toBeNull()
})

test.each([[null], [undefined], ['']])('번호가 없으면(%s) 아무것도 그리지 않는다', (requestId) => {
  const { container } = render(<RequestIdLine requestId={requestId} />)

  expect(container).toBeEmptyDOMElement()
})
