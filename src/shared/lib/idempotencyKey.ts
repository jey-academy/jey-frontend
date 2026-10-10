/**
 * `Idempotency-Key` 헤더에 넣을 값을 새로 만든다.
 * 같은 시도를 다시 보낼 때는 새로 만들지 말고 처음 만든 키를 그대로 써야 한다.
 * 그래야 서버가 같은 요청으로 알아보고 한 번만 처리한다.
 */
export function createIdempotencyKey(): string {
  return crypto.randomUUID()
}
