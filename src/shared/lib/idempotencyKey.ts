/**
 * `Idempotency-Key` 헤더에 넣을 값(UUID)을 새로 만든다.
 * 같은 시도를 다시 보낼 때는 새로 만들지 말고 처음 만든 키를 그대로 써야 한다.
 * 그래야 서버가 같은 요청으로 알아보고 한 번만 처리한다.
 */
export function createIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  // randomUUID는 https(또는 localhost)와 iOS 15.4 이상에서만 있다.
  // 없으면 같은 수준의 난수(getRandomValues)로 UUID v4를 직접 만든다.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}
