import { expect, test } from 'vitest'
import type { DiscountType } from './api'
import {
  discountLabel,
  extraDiscounts,
  fitToLists,
  formatMonth,
  isMonth,
  monthChoices,
  shiftMonth,
  toRequest,
  validateLines,
} from './invoiceInput'

test.each([
  ['2026-10-21', ['2026-10', '2026-11']],
  ['2026-12-31', ['2026-12', '2027-01']],
  ['2027-01-01', ['2027-01', '2027-02']],
  ['2026-09-30', ['2026-09', '2026-10']],
])('%s의 대상 월은 그달과 다음 달이다', (today, expected) => {
  expect(monthChoices(today)).toEqual(expected)
})

test.each([
  ['2026-10', 1, '2026-11'],
  ['2026-12', 1, '2027-01'],
  ['2027-01', -1, '2026-12'],
  ['2026-10', -10, '2025-12'],
  ['2026-10', 0, '2026-10'],
])('%s에서 %i달 옮기면 %s다', (month, delta, expected) => {
  expect(shiftMonth(month, delta)).toBe(expected)
})

test.each([
  ['2026-10', true],
  ['2026-01', true],
  ['2026-12', true],
  ['2026-13', false],
  ['2026-00', false],
  ['2026-1', false],
  ['2026-10-01', false],
  ['26-10', false],
  ['', false],
])('%s는 달 하나인가: %s', (value, expected) => {
  expect(isMonth(value)).toBe(expected)
})

test('대상 월은 "2026년 1월" 모양으로 읽는다', () => {
  expect(formatMonth('2027-01')).toBe('2027년 1월')
  expect(formatMonth('2026-11')).toBe('2026년 11월')
})

test('패스 할인은 대소문자와 상관없이 고르는 목록에서 뺀다', () => {
  const type = (code: string, active = true): DiscountType => ({
    id: 1,
    code,
    name: code,
    rate: 0.05,
    active,
  })
  expect(
    extraDiscounts([type('dongtan_pass'), type('SIBLING_5'), type('OFF', false)]).map(
      (item) => item.code,
    ),
  ).toEqual(['SIBLING_5'])
})

test.each([
  ['형제 할인', '5%', '형제 할인 5%'],
  ['형제 할인 5%', '5%', '형제 할인 5%'],
  ['5% 형제 할인', '5%', '5% 형제 할인'],
  ['형제 할인 15%', '5%', '형제 할인 15% 5%'],
  ['행사 2.5%', '5%', '행사 2.5% 5%'],
  ['행사 7.25%', '7.25%', '행사 7.25%'],
  ['행사 17.25%', '7.25%', '행사 17.25% 7.25%'],
])('할인 이름 "%s"에 %s를 붙이면 "%s"', (name, percent, expected) => {
  expect(discountLabel(name, percent)).toBe(expected)
})

test('1회와 31회는 받고, 앞뒤 공백은 떼고 보낸다', () => {
  expect(
    toRequest({
      targetMonth: '2026-11',
      lines: [
        { key: 1, classId: '10', lessonCount: ' 1 ' },
        { key: 2, classId: '11', lessonCount: '31' },
      ],
      discountCodes: [],
    }),
  ).toEqual({
    targetMonth: '2026-11',
    lines: [
      { classId: 10, lessonCount: 1 },
      { classId: 11, lessonCount: 31 },
    ],
    discountCodes: [],
  })
})

test('반이 비었거나 같은 반이 두 번이면 보낼 본문이 없다', () => {
  const lines = [
    { key: 1, classId: '10', lessonCount: '8' },
    { key: 2, classId: '10', lessonCount: '8' },
  ]
  expect(validateLines(lines)).toEqual([{}, { classId: '같은 반을 두 번 골랐어요.' }])
  expect(toRequest({ targetMonth: '2026-11', lines, discountCodes: [] })).toBeNull()
  expect(
    toRequest({
      targetMonth: '2026-11',
      lines: [{ key: 1, classId: '', lessonCount: '8' }],
      discountCodes: [],
    }),
  ).toBeNull()
})

test('추가 할인이 3개를 넘으면 보낼 본문이 없다', () => {
  expect(
    toRequest({
      targetMonth: '2026-11',
      lines: [{ key: 1, classId: '10', lessonCount: '8' }],
      discountCodes: ['A', 'B', 'C', 'D'],
    }),
  ).toBeNull()
})

const option = (code: string): DiscountType => ({
  id: 1,
  code,
  name: code,
  rate: 0.05,
  active: true,
})

test('입력이 지금 목록에 다 있으면 받은 객체를 그대로 돌려준다', () => {
  const input = {
    targetMonth: '2026-11',
    lines: [{ key: 1, classId: '10', lessonCount: '8' }],
    discountCodes: ['A'],
  }
  const fitted = fitToLists(input, new Set(['10']), [option('A')])
  expect(fitted.input).toBe(input)
  expect(fitted).toMatchObject({ clearedClass: false, droppedCodes: [] })
})

test('목록에 없는 반은 비우고, 없는 할인은 빼고, 무엇을 바꿨는지 알려 준다', () => {
  const fitted = fitToLists(
    {
      targetMonth: '2026-11',
      lines: [
        { key: 1, classId: '10', lessonCount: '8' },
        { key: 2, classId: '11', lessonCount: '4' },
        { key: 3, classId: '', lessonCount: '' },
      ],
      discountCodes: ['A', 'B'],
    },
    new Set(['11']),
    [option('B')],
  )
  expect(fitted).toEqual({
    input: {
      targetMonth: '2026-11',
      lines: [
        { key: 1, classId: '', lessonCount: '8' },
        { key: 2, classId: '11', lessonCount: '4' },
        { key: 3, classId: '', lessonCount: '' },
      ],
      discountCodes: ['B'],
    },
    clearedClass: true,
    droppedCodes: ['A'],
  })
})

test('할인만 빠져도 반은 그대로 둔다', () => {
  const fitted = fitToLists(
    {
      targetMonth: '2026-11',
      lines: [{ key: 1, classId: '10', lessonCount: '8' }],
      discountCodes: ['A'],
    },
    new Set(['10']),
    [],
  )
  expect(fitted.input.lines[0].classId).toBe('10')
  expect(fitted).toMatchObject({ clearedClass: false, droppedCodes: ['A'] })
})
