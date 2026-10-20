import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiError } from './error'
import { useIdempotentPost } from './useIdempotentPost'

const fetchMock = vi.fn<typeof fetch>()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  // 로그인한 브라우저처럼 CSRF 토큰 쿠키를 둔다. 없으면 POST마다 토큰을 받으러 가는 요청이 먼저 나간다.
  document.cookie = 'XSRF-TOKEN=token'
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
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

/** 훅이 돌려준 함수 그대로. 실패하면 던진다. */
function setupRaw() {
  const { result } = renderHook(() =>
    useIdempotentPost<{ name: string }, unknown>('/api/v1/things'),
  )
  return (name: string) => result.current({ name })
}

function setup() {
  const post = setupRaw()
  // 실패는 결과로 돌려준다. 테스트가 이어서 다시 보낼 수 있게 한다.
  return (name: string) => post(name).catch((error: unknown) => error)
}

/** 테스트가 원하는 때에 끝낼 수 있는 응답. */
function deferred() {
  let resolve!: (response: Response) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<Response>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
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

test('성공하면 서버가 준 값을 돌려준다', async () => {
  fetchMock.mockResolvedValueOnce(ok({ id: 7, name: '가' }))
  const post = setupRaw()

  await expect(post('가')).resolves.toEqual({ id: 7, name: '가' })
})

test.each([
  ['응답을 받지 못하면', () => Promise.reject(new TypeError('Failed to fetch')), null],
  ['서버가 거부하면', () => Promise.resolve(problem(409, 'MEMBER_STUDENT_DUPLICATED')), 409],
])('%s 실패를 삼키지 않고 ApiError로 던진다', async (_case, failure, status) => {
  fetchMock.mockImplementationOnce(failure)
  const post = setupRaw()

  const error: unknown = await post('가').then(
    () => null,
    (thrown: unknown) => thrown,
  )

  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).status).toBe(status)
})

test.each([
  ['연결이 끊긴 뒤', () => Promise.reject(new TypeError('Failed to fetch'))],
  // 서버는 성공으로 답했는데 본문을 읽지 못했다. 처리는 끝났다.
  ['응답을 읽지 못한 뒤', () => Promise.resolve(new Response('<html>', { status: 200 }))],
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

  // 처음 요청이 서버에서 끝났는데 응답만 놓친 것이면, 서버는 다시 만들지 않고 처음의 응답을 돌려준다.
  // 처음 요청이 끝나지 못한 것이면(5xx, 429) 서버는 보관한 응답이 없어 다시 처리한다.
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(keys()[0]).toMatch(UUID)
  expect(keys()[1]).toBe(keys()[0])
})

test('제한 시간이 지나 응답을 받지 못한 뒤 같은 내용으로 다시 보내면 같은 키를 쓴다', async () => {
  vi.useFakeTimers()
  fetchMock
    // 응답하지 않다가 요청이 취소되면 실패한다.
    .mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    .mockResolvedValueOnce(ok())
  const post = setup()

  const first = post('가')
  await vi.advanceTimersByTimeAsync(10_000)
  const error = await first
  await post('가')

  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).kind).toBe('timeout')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(keys()[1]).toBe(keys()[0])
})

test('응답을 받지 못했어도 내용을 고쳐 다시 보내면 새 키를 쓴다', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok())
  const post = setup()

  await post('가')
  await post('나')

  // 같은 키에 다른 내용을 보내면 서버가 거부한다(422).
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(keys()[1]).toMatch(UUID)
  expect(keys()[1]).not.toBe(keys()[0])
})

test('응답을 받지 못했어도 주소가 바뀌면 새 키를 쓴다', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok())
  const { result, rerender } = renderHook(
    ({ path }) => useIdempotentPost<{ name: string }, unknown>(path),
    { initialProps: { path: '/api/v1/things' } },
  )

  await result.current({ name: '가' }).catch((error: unknown) => error)
  rerender({ path: '/api/v1/others' })
  await result.current({ name: '가' })

  // 서버는 주소가 다르면 다른 요청으로 본다. 같은 키로 보내면 거부한다(422).
  expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/others')
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

  // 서버는 끝까지 처리한 거부도 보관한다. 같은 키로 다시 보내면 처음의 거부를 그대로 돌려준다.
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(keys()[1]).toMatch(UUID)
  expect(keys()[1]).not.toBe(keys()[0])
})

test('응답을 놓친 뒤 CSRF 토큰을 받지 못해 보내지 못했어도, 그다음에 같은 내용으로 보내면 처음 키를 쓴다', async () => {
  fetchMock
    // 1) 처음 보낸 요청의 응답을 놓쳤다.
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    // 2) 다시 보내려는데 토큰 쿠키가 없어 토큰을 받으러 갔다가 실패했다. 본 요청은 나가지 않았다.
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    // 3) 다시 보낸다.
    .mockResolvedValueOnce(ok())
  const post = setup()

  expect(await post('가')).toBeInstanceOf(ApiError)
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  const notSent = await post('가')
  expect(notSent).toBeInstanceOf(ApiError)
  expect((notSent as ApiError).notSent).toBe(true)
  document.cookie = 'XSRF-TOKEN=token'
  await post('가')

  // 토큰 요청에는 키가 없다. 본 요청 둘은 같은 키다.
  const sent = keys().filter((key) => key !== null)
  expect(sent).toHaveLength(2)
  expect(sent[1]).toBe(sent[0])
})

test('성공한 뒤에는 같은 내용이어도 새 키를 쓴다', async () => {
  fetchMock.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok())
  const post = setup()

  await post('가')
  await post('가')

  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(keys()[1]).toMatch(UUID)
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
  expect(fourth).toMatch(UUID)
  expect(fourth).not.toBe(first)
})

test.each([
  ['성공해도', () => ok()],
  ['거부돼도', () => problem(400, 'COMMON_VALIDATION_FAILED')],
])(
  '먼저 보낸 요청이 늦게 %s, 그 사이 다른 내용으로 보낸 요청의 키는 남는다',
  async (_case, late) => {
    const first = deferred()
    fetchMock
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ok())
    const post = setup()

    const early = post('가')
    // 두 번째 요청은 응답을 받지 못했다. 그 키는 다시 보낼 때 써야 한다.
    await post('나')
    first.resolve(late())
    await early
    await post('나')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(keys()[1]).not.toBe(keys()[0])
    expect(keys()[2]).toBe(keys()[1])
  },
)

test('본문 없는 POST에도 키를 싣고, 응답을 받지 못한 뒤 다시 보내면 같은 키를 쓴다', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok())
  const { result } = renderHook(() => useIdempotentPost<void, unknown>('/api/v1/things/1/close'))

  const error: unknown = await result.current().catch((thrown: unknown) => thrown)
  await result.current()

  // 연결 실패다. 훅 안에서 난 코드 오류(TypeError)가 아니다.
  expect(error).toBeInstanceOf(ApiError)
  expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined()
  expect(keys()[0]).toMatch(UUID)
  expect(keys()[1]).toBe(keys()[0])
})

test('화면마다 따로 기억한다', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok())
  const first = setup()
  const second = setup()

  await first('가')
  await second('가')

  // 다른 화면(다른 창)의 지난 시도와 내용이 같다고 같은 요청은 아니다.
  expect(keys()[1]).toMatch(UUID)
  expect(keys()[1]).not.toBe(keys()[0])
})
