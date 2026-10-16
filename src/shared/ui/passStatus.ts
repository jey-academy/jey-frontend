/**
 * 패스 상태. Pill과 StatusBanner가 같이 쓴다.
 * canceled는 발급한 연계 학원이 취소한 패스다(백엔드 상태 CANCELED). 만료는 서버가 날짜로 계산한다.
 * 서버의 상태 이름(ISSUED 등)은 화면마다 응답을 받는 곳에서 이 값으로 바꾼다(dongtanpass의 passState.ts).
 */
export type PassStatus = 'valid' | 'used' | 'expired' | 'canceled'

/** 상태의 이름. Pill의 기본 문구이고, 장부의 상태 거르기도 같은 이름을 쓴다. */
export const passStatusLabels: Record<PassStatus, string> = {
  valid: '사용 가능',
  used: '사용 완료',
  expired: '기간 만료',
  canceled: '발급 취소',
}
