import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Sheet } from './Sheet'

test('제목이 묶음의 이름이 된다', () => {
  render(
    <Sheet title="발급 정보">
      <p>햇살수학</p>
    </Sheet>,
  )

  const sheet = screen.getByRole('region', { name: '발급 정보' })
  expect(sheet).toHaveTextContent('햇살수학')
  expect(screen.getByRole('heading', { level: 2, name: '발급 정보' })).toBeInTheDocument()
})
