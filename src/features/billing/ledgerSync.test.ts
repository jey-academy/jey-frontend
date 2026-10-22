import { expect, test } from 'vitest'
import { reasonText } from './ledgerSync'

test('그 달 탭 없음은 대상 월을 "2026년 1월"처럼 넣고, 탭 이름은 기본 모양을 예로만 든다', () => {
  expect(reasonText('TAB_NOT_FOUND', '2026-01').todo).toBe(
    '장부에 그 지점의 2026년 1월 탭이 없어요. 탭을 만들거나 이름을 맞춰 주세요(기본 이름 예: 11월 동탄관(26)).',
  )
})

test('대상 월의 모양이 다르면 받은 그대로 넣는다', () => {
  expect(reasonText('TAB_NOT_FOUND', '2026/11').todo).toContain('그 지점의 2026/11 탭이')
})
