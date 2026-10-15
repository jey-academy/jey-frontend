/**
 * 패스 상태. Pill과 StatusBanner가 같이 쓴다.
 * canceled는 발급한 연계 학원이 취소한 패스다(백엔드 상태 CANCELED). 만료는 서버가 날짜로 계산한다.
 * 백엔드 API 타입이 생성되면(`npm run api:gen`) 그 타입에서 가져오도록 바꾼다.
 */
export type PassStatus = 'valid' | 'used' | 'expired' | 'canceled'
