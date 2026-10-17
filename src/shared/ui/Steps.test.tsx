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

test('단계마다 상태를 주면 원 모양을 바꾸고, 화면 읽기 프로그램에 상태를 글로 알린다', () => {
  render(
    <Steps
      items={[
        { title: '패스 확인', state: 'done' },
        { title: '본인 확인', state: 'failed', detail: <p>결과 줄</p> },
        { title: '학생 등록', state: 'current' },
        { title: '패스 사용 처리', state: 'todo' },
      ]}
    />,
  )

  const items = screen.getAllByRole('listitem')
  expect(items[0]).toHaveTextContent('패스 확인 (끝남)')
  expect(items[1]).toHaveTextContent('본인 확인 (확인 필요)')
  expect(items[2]).toHaveTextContent('학생 등록 (지금 단계)')
  expect(items[3]).toHaveTextContent('패스 사용 처리 (남음)')
  expect(items.map((item) => item.getAttribute('aria-current'))).toEqual([null, null, 'step', null])
  // 끝난 단계는 체크, 확인이 필요한 단계는 "!"로 숫자 대신 그린다(장식).
  expect(items[0]).toHaveTextContent(/^패스 확인/)
  expect(items[0].querySelector('svg')).not.toBeNull()
  expect(items[1]).toHaveTextContent(/^!본인 확인/)
  expect(items[1]).toHaveTextContent('결과 줄')
  expect(items[3]).toHaveTextContent(/^4/)
})

test('상태를 주지 않으면(사용 안내) 상태 글과 aria-current가 없다', () => {
  render(<Steps items={[{ title: '위 QR을 보여 주세요' }]} />)

  expect(screen.getByRole('listitem')).not.toHaveAttribute('aria-current')
  expect(screen.getByRole('listitem')).toHaveTextContent(/^1위 QR을 보여 주세요$/)
})
