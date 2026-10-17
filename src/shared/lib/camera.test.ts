import { afterEach, expect, test } from 'vitest'
import { canUseCamera } from './camera'

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

test('카메라 기능이 있는 브라우저에서만 참이다', () => {
  expect(canUseCamera()).toBe(false)

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: () => Promise.reject(new Error('쓰지 않음')) },
  })
  expect(canUseCamera()).toBe(true)
})

test('카메라 기능 묶음은 있어도 켜는 함수가 없으면 거짓이다', () => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} })

  expect(canUseCamera()).toBe(false)
})
