import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiError } from './error'
import { useIdempotentPost } from './useIdempotentPost'

const fetchMock = vi.fn<typeof fetch>()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function ok(body: unknown = { id: 1 }) {
  return new Response(JSON.stringify(body), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })
}

function problem(status: number, code?: string) {
  return new Response(JSON.stringify({ status, code, detail: '안내' }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

/** 지금까지 나간 요청의 Idempotency-Key 헤더. */
function keys() {
  return fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))
}

function setup() {
  const { result } = renderHook(() =>
    useIdempotentPost<{ name: string }, unknown>('/api/v1/things'),
  )
  // 실패는 결과로 돌려준다. 테스트가 이어서 다시 보낼 수 있게 한다.
  return (name: string) => result.current({ name }).catch((error: unknown) => error)
}

test('POST에 UUID 형식의 Idempotency-Key를 싣고, 본문은 그대로 보낸다', async () => {
  fetchMock.mockResolvedValueOnce(ok())
  const post = setup()

  await post('가')

  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/v1/things')
  expect(init?.method).toBe('POST')
  expect(init?.body).toBe(JSON.stringify({ name: '가' }))
  expect(keys()[0]).toMatch(UUID)
})

test.each([
  ['연결이 끊긴 뒤', () => Promise.reject(new TypeError('Failed to fetch'))],
  ['서버 오류(500) 뒤', () => Promise.resolve(problem(500))],
  ['중간 서버 오류(502) 뒤', () => Promise.resolve(new Response('<html>', { status: 502 }))],
  ['요청이 너무 많다는 답(429) 뒤', () => Promise.resolve(problem(429))],
  [
    '아직 처리 중이라는 답 뒤',
    () => Promise.resolve(problem(409, 'COMMON_IDEMPOTENCY_IN_PROGRESS')),
  ],
])('%s 같은 내용으로 다시 보내면 같은 키를 쓴다', async (_case, failure) => {
  fetchMock.mockImplementationOnce(failure).mockResolvedValueOnce(ok())
  const post = setup()

  expect(await post('가')).toBeInstanceOf(ApiError)
  await post('가')

  // 처음 요청이 서버에서 처리됐더라도 두 번 만들어지지 않고, 처음의 응답을 받는다.
  expect(keys()[1]).toBe(keys()[0])
})

test('응답을 받지 못했어도 내용을 고쳐 다시 보내면 새 키를 쓴다', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok())
  const post = setup()

  await post('가')
  await post('나')

  // 같은 키에 다른 내용을 보내면 서버가 거부한다(422).
  expect(keys()[1]).toMatch(UUID)
  expect(keys()[1]).not.toBe(keys()[0])
})

test.each([
  ['입력값 오류(400)', 400, 'COMMON_VALIDATION_FAILED'],
  ['중복(409)', 409, 'MEMBER_STUDENT_DUPLICATED'],
  ['키를 다른 내용에 다시 씀(422)', 422, 'COMMON_IDEMPOTENCY_KEY_REUSED'],
])('서버가 거부한 뒤(%s)에는 같은 내용이어도 새 키를 쓴다', async (_case, status, code) => {
  fetchMock.mockResolvedValueOnce(problem(status, code)).mockResolvedValueOnce(ok())
  const post = setup()

  await post('가')
  await post('가')

  // 같은 키로 다시 보내면 서버가 처음의 거부를 그대로 돌려준다.
  expect(keys()[1]).not.toBe(keys()[0])
})

test('성공한 뒤에는 같은 내용이어도 새 키를 쓴다', async () => {
  fetchMock.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok())
  const post = setup()

  await post('가')
  await post('가')

  expect(keys()[1]).not.toBe(keys()[0])
})

test('실패가 이어지는 동안에는 같은 키를 계속 쓰고, 성공하면 버린다', async () => {
  fetchMock
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(problem(503))
    .mockResolvedValueOnce(ok())
    .mockResolvedValueOnce(ok())
  const post = setup()

  await post('가')
  await post('가')
  await post('가')
  await post('가')

  const [first, second, third, fourth] = keys()
  expect(second).toBe(first)
  expect(third).toBe(first)
  expect(fourth).not.toBe(first)
})

test('화면마다 따로 기억한다', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok())
  const first = setup()
  const second = setup()

  await first('가')
  await second('가')

  // 다른 화면(다른 창)의 지난 시도와 내용이 같다고 같은 요청은 아니다.
  expect(keys()[1]).not.toBe(keys()[0])
})
