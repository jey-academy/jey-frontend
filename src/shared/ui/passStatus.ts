/**
 * 패스 상태. Pill과 StatusBanner가 같이 쓴다.
 * 백엔드 API 타입이 생성되면(`npm run api:gen`) 그 타입에서 가져오도록 바꾼다.
 */
export type PassStatus = 'valid' | 'used' | 'expired'
