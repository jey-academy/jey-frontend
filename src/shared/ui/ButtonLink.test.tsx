import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { ButtonLink } from './ButtonLink'

test('링크를 기본 버튼 모양으로 그린다', () => {
  render(
    <MemoryRouter>
      <ButtonLink to="/find">패스 찾기</ButtonLink>
    </MemoryRouter>,
  )

  const link = screen.getByRole('link', { name: '패스 찾기' })
  expect(link).toHaveAttribute('href', '/find')
  expect(link).toHaveClass('bg-night', 'h-[52px]', 'rounded-btn')
})

test('variant, size, block과 className을 반영한다', () => {
  render(
    <MemoryRouter>
      <ButtonLink to="/" variant="ghost" size="sm" block className="mt-2">
        처음으로
      </ButtonLink>
    </MemoryRouter>,
  )

  const link = screen.getByRole('link', { name: '처음으로' })
  expect(link).toHaveClass('bg-field', 'h-[38px]', 'w-full', 'mt-2')
  expect(link).not.toHaveClass('bg-night')
})
