import { expect, test } from 'vitest'
import { createIdempotencyKey } from './idempotencyKey'

test('UUID 형식의 키를 만든다', () => {
  expect(createIdempotencyKey()).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
})

test('부를 때마다 다른 키를 만든다', () => {
  const keys = new Set(Array.from({ length: 100 }, () => createIdempotencyKey()))

  expect(keys.size).toBe(100)
})
