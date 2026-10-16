import { expect, test } from 'vitest'
import { canCancel, canRegenerateLink, isPassState, toPassStatus } from './passState'

test.each([
  ['ISSUED', 'valid'],
  ['REDEEMED', 'used'],
  ['EXPIRED', 'expired'],
  ['CANCELED', 'canceled'],
])('서버 상태 %s는 화면 상태 %s다', (state, status) => {
  expect(toPassStatus(state)).toBe(status)
})

test.each(['USED', 'issued', '', 'toString', '__proto__'])(
  '모르는 상태(%s)는 null이다',
  (state) => {
    expect(toPassStatus(state)).toBeNull()
    expect(isPassState(state)).toBe(false)
  },
)

test('쓰지 않은 패스만 링크를 새로 만들고, 만료된 패스는 취소만 된다', () => {
  expect([canRegenerateLink('ISSUED'), canCancel('ISSUED')]).toEqual([true, true])
  expect([canRegenerateLink('EXPIRED'), canCancel('EXPIRED')]).toEqual([false, true])
  expect([canRegenerateLink('REDEEMED'), canCancel('REDEEMED')]).toEqual([false, false])
  expect([canRegenerateLink('CANCELED'), canCancel('CANCELED')]).toEqual([false, false])
})
