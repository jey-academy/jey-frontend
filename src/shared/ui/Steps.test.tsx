import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Steps } from './Steps'

test('단계를 순서 있는 목록으로 그린다', () => {
  render(
    <Steps
      items={[
        {
          title: 'JEY 어학원 동탄관 데스크에 방문해요',
          description: '신규 등록할 때 한 번 쓸 수 있어요',
        },
        { title: '위 QR을 보여 주세요' },
      ]}
    />,
  )

  const items = screen.getAllByRole('listitem')
  expect(screen.getByRole('list').tagName).toBe('OL')
  expect(items).toHaveLength(2)
  expect(items[0]).toHaveTextContent(
    '1JEY 어학원 동탄관 데스크에 방문해요신규 등록할 때 한 번 쓸 수 있어요',
  )
  expect(items[1]).toHaveTextContent(/^2위 QR을 보여 주세요$/)
  expect(screen.getByText('2')).toHaveAttribute('aria-hidden', 'true')
})
