import { afterEach, expect, test, vi } from 'vitest'
import { createIdempotencyKey } from './idempotencyKey'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

/** randomUUID가 없는 환경(https가 아닌 주소, 구형 iOS)을 흉내 낸다. */
function removeRandomUUID() {
  const realCrypto = globalThis.crypto
  vi.stubGlobal('crypto', {
    getRandomValues: <T extends ArrayBufferView>(array: T) => realCrypto.getRandomValues(array),
  })
}

test('UUID 형식의 키를 만든다', () => {
  expect(createIdempotencyKey()).toMatch(UUID_V4)
})

test('부를 때마다 다른 키를 만든다', () => {
  const keys = new Set(Array.from({ length: 100 }, () => createIdempotencyKey()))

  expect(keys.size).toBe(100)
})

test('randomUUID가 없는 환경에서도 UUID 형식의 키를 만든다', () => {
  removeRandomUUID()

  expect(createIdempotencyKey()).toMatch(UUID_V4)
})

test('randomUUID가 없는 환경에서도 부를 때마다 다른 키를 만든다', () => {
  removeRandomUUID()
  const keys = new Set(Array.from({ length: 100 }, () => createIdempotencyKey()))

  expect(keys.size).toBe(100)
})
