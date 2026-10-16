import type { PassStatus } from '@/shared/ui'
import type { LedgerItem } from './api'

/** 서버가 주는 패스 상태. 장부의 줄과 상태 거르기가 같은 넷이다. */
export type PassState = LedgerItem['state']

const statusOf: Record<PassState, PassStatus> = {
  ISSUED: 'valid',
  REDEEMED: 'used',
  EXPIRED: 'expired',
  CANCELED: 'canceled',
}

/**
 * 서버의 상태를 화면의 상태(Pill, StatusBanner)로 바꾼다.
 * 서버가 모르는 상태를 보내면(새 상태가 생겼는데 화면을 아직 고치지 않음) null이다. 부르는 쪽은 상태 없이 그린다.
 */
export function toPassStatus(state: string): PassStatus | null {
  return Object.hasOwn(statusOf, state) ? statusOf[state as PassState] : null
}

/** 장부의 상태 거르기에서 고를 수 있는 값인지. 주소를 손으로 고친 경우를 거른다. */
export function isPassState(value: string): value is PassState {
  return Object.hasOwn(statusOf, value)
}

/** 상태 거르기의 순서. 화면의 칩도 이 순서다. */
export const passStates: PassState[] = ['ISSUED', 'REDEEMED', 'EXPIRED', 'CANCELED']

/**
 * 링크 새로 만들기와 취소를 할 수 있는 상태. 쓰지 않은 패스만 된다(만료가 지났어도 된다).
 * 만료된 패스는 취소만 보여 준다. 새 링크를 열어도 만료로만 보여 쓸 데가 없다.
 */
export function canRegenerateLink(state: string) {
  return state === 'ISSUED'
}

export function canCancel(state: string) {
  return state === 'ISSUED' || state === 'EXPIRED'
}
