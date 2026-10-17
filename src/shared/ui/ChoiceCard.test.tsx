import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { ChoiceCard } from './ChoiceCard'

function renderCard(tone?: 'glow' | 'night') {
  return render(
    <MemoryRouter>
      <ChoiceCard
        to="/find"
        tone={tone}
        title="패스 링크 다시 받기"
        description="학생 이름과 학부모 번호로 받아요"
        icon={<svg aria-hidden="true" data-testid="icon" />}
        className="mt-2"
      />
    </MemoryRouter>,
  )
}

test('ChoiceCard: 제목이 링크 이름, 설명은 따로 읽히는 링크다', () => {
  renderCard()

  const link = screen.getByRole('link', { name: '패스 링크 다시 받기' })
  expect(link).toHaveAttribute('href', '/find')
  expect(link).toHaveAccessibleDescription('학생 이름과 학부모 번호로 받아요')
  expect(link).toHaveClass('mt-2')
  expect(screen.getByTestId('icon')).toBeInTheDocument()
})

test.each([
  ['glow', 'bg-glow-soft'],
  ['night', 'bg-night-soft'],
  [undefined, 'bg-night-soft'],
] as const)('ChoiceCard: tone이 %s이면 아이콘 칸이 %s', (tone, className) => {
  renderCard(tone)

  expect(screen.getByTestId('icon').parentElement).toHaveClass(className)
})
