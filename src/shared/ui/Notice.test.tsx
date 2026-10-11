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
