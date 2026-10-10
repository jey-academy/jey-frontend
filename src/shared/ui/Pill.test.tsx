import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Pill } from './Pill'

test('문구를 생략하면 상태별 기본 문구를 보여준다', () => {
  render(
    <>
      <Pill status="valid" />
      <Pill status="used" />
      <Pill status="expired" />
    </>,
  )

  expect(screen.getByText('사용 가능')).toHaveClass('bg-mint-bg', 'text-pill-valid')
  expect(screen.getByText('사용 완료')).toHaveClass('bg-gray-bg', 'text-pill-used')
  expect(screen.getByText('기간 만료')).toHaveClass('bg-red-bg', 'text-pill-expired')
})

test('문구를 주면 그 문구를 보여준다', () => {
  render(<Pill status="valid">11월 5일까지</Pill>)

  expect(screen.getByText('11월 5일까지')).toBeInTheDocument()
})
