import { expect, test } from 'vitest'
import { actionLabel, detailLines, knownActions, outcomeLabel, targetLabel } from './labels'

test('아는 행위 이름은 뜻으로, 모르는 이름은 그대로 보여준다', () => {
  expect(actionLabel('member.guardian-linked')).toBe('학부모 연결')
  expect(actionLabel('billing.invoice-created')).toBe('billing.invoice-created')
  // 객체에 원래 있는 이름과 겹쳐도 그대로 보여준다.
  expect(actionLabel('constructor')).toBe('constructor')
  expect(actionLabel('toString')).toBe('toString')
})

test('전달 문서의 행위 이름 15개를 모두 안다', () => {
  expect(knownActions.map((action) => action.value).toSorted()).toEqual([
    'member.guardian-already-linked',
    'member.guardian-linked',
    'member.guardian-phone-duplicated',
    'member.guardian-phone-revealed',
    'member.guardian-relation-changed',
    'member.guardian-unlinked',
    'member.guardian-updated',
    'member.phone-change-limited',
    'member.phone-probe-limited',
    'member.phone-reveal-limited',
    'member.student-duplicated',
    'member.student-phone-removed',
    'member.student-phone-revealed',
    'member.student-registered',
    'member.student-updated',
  ])
  // 선택 상자에서 구분되도록 표시 이름이 겹치지 않는다.
  expect(new Set(knownActions.map((action) => action.label)).size).toBe(knownActions.length)
})

test('결과의 표시 이름. 타입에 없는 값은 그대로 보여준다', () => {
  expect(outcomeLabel('DONE')).toBe('한 일')
  expect(outcomeLabel('DENIED')).toBe('거부')
  expect(outcomeLabel('PENDING' as never)).toBe('PENDING')
})

test('대상의 표시 이름', () => {
  expect(targetLabel('student', 12)).toBe('학생 12')
  expect(targetLabel('guardian', 9)).toBe('학부모 9')
  expect(targetLabel('invoice', 3)).toBe('invoice 3')
  expect(targetLabel('student', null)).toBe('학생')
  expect(targetLabel('student', undefined)).toBe('학생')
})

test('내용은 키와 값을 그대로 나열한다', () => {
  expect(detailLines({ guardianId: 5, linkedToExisting: false })).toEqual([
    { text: 'guardianId: 5', alert: false },
    { text: 'linkedToExisting: false', alert: false },
  ])
  expect(detailLines({ note: '메모', nested: { a: [1, 2] }, empty: null })).toEqual([
    { text: 'note: 메모', alert: false },
    { text: 'nested: {"a":[1,2]}', alert: false },
    { text: 'empty: null', alert: false },
  ])
})

test('내용이 없으면 줄이 없다', () => {
  expect(detailLines(null)).toEqual([])
  expect(detailLines({})).toEqual([])
})

test('내용을 싣지 못했다는 표시는 문장으로 바꾸고, 손상된 기록만 강조한다', () => {
  expect(detailLines({ truncated: true })).toEqual([
    { text: '내용이 길어 싣지 않았어요', alert: false },
  ])
  expect(detailLines({ redacted: true })).toEqual([
    { text: '개인정보로 보이는 값이 있어 내용을 뺐어요', alert: false },
  ])
  expect(detailLines({ unreadable: true })).toEqual([
    { text: '적을 때 내용을 읽지 못했어요', alert: false },
  ])
  expect(detailLines({ corrupted: true })).toEqual([{ text: '기록이 손상됐어요', alert: true }])
})

test('표시와 이름이 같아도 값이 true가 아니면 그대로 나열한다', () => {
  expect(detailLines({ corrupted: false, truncated: 'yes' })).toEqual([
    { text: 'corrupted: false', alert: false },
    { text: 'truncated: yes', alert: false },
  ])
})
