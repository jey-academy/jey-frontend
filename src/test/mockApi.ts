import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, vi } from 'vitest'

type Handler = (request: { body: unknown }) => Response | Promise<Response>

const fetchMock = vi.fn<typeof fetch>()
let handlers: Record<string, Handler> = {}
let unexpectedRequests: string[] = []
let installed = false

// setupMockApi()를 빼먹으면 fetch가 진짜 그대로라, "요청이 없다"는 단언이 조용히 통과해 버린다.
function requireSetup() {
  if (!installed) throw new Error('테스트 파일 맨 위에서 setupMockApi()를 먼저 불러야 해요.')
}

function keyOf(input: Parameters<typeof fetch>[0], init?: RequestInit) {
  return `${init?.method ?? 'GET'} ${String(input)}`
}

function parseBody(init?: RequestInit): unknown {
  return typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 백엔드의 에러 응답(Problem Details). 실제 응답처럼 영어 title도 넣는다. 화면에는 detail만 나와야 한다. */
export function problemResponse(status: number, problem: Record<string, unknown>) {
  return new Response(JSON.stringify({ title: 'Error', status, ...problem }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

export const noContent = () => new Response(null, { status: 204 })

export const unauthenticated = () =>
  problemResponse(401, { detail: '로그인이 필요합니다.', code: 'COMMON_UNAUTHENTICATED' })

/**
 * 주소와 메서드별로 응답을 정한다(예: `'GET /api/v1/auth/me'`). 이미 정한 것에 덧붙인다.
 * 정하지 않은 요청이 나가면 테스트가 끝날 때 실패한다.
 * 테스트 안에서 부른다. 테스트 밖(파일 최상위)에서 정한 것은 테스트가 시작될 때 지워진다.
 */
export function mockApi(next: Record<string, Handler>) {
  requireSetup()
  handlers = { ...handlers, ...next }
}

/** 지금까지 나간 요청을 "메서드 주소" 목록으로. */
export function requests() {
  requireSetup()
  return fetchMock.mock.calls.map(([input, init]) => keyOf(input, init))
}

/** 그 요청 중 마지막 것의 헤더와 본문. */
export function requestOf(key: string) {
  requireSetup()
  const call = fetchMock.mock.calls.findLast(([input, init]) => keyOf(input, init) === key)
  if (!call) throw new Error(`나가지 않은 요청: ${key}`)
  const init = call[1] ?? {}
  return { init, headers: new Headers(init.headers), body: parseBody(init) }
}

/** 한 번도 요청이 나가지 않았는지 확인할 때 쓴다. */
export function expectNoRequests() {
  requireSetup()
  expect(fetchMock).not.toHaveBeenCalled()
}

/** 테스트 파일 맨 위에서 한 번 부른다. fetch를 가짜로 바꾸고, 테스트마다 응답 설정과 기록을 비운다. */
export function setupMockApi() {
  beforeEach(() => {
    installed = true
    handlers = {}
    unexpectedRequests = []
    fetchMock.mockImplementation(async (input, init) => {
      const key = keyOf(input, init)
      const handler = handlers[key]
      if (!handler) {
        // 여기서 던진 에러는 fetch 래퍼가 연결 실패로 바꿔 버린다. 그래서 따로 모아 두고 끝에서 확인한다.
        unexpectedRequests.push(key)
        throw new Error(`흉내 내지 않은 요청: ${key}`)
      }
      return handler({ body: parseBody(init) })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    // 화면을 먼저 치운다. 아래 단언이 실패하면 공용 cleanup(src/test/setup.ts)이 돌지 않아,
    // 남은 화면과 그 화면의 재시도 요청이 다음 테스트로 넘어가 엉뚱한 테스트까지 실패한다.
    cleanup()
    const unexpected = unexpectedRequests
    fetchMock.mockReset()
    vi.unstubAllGlobals()
    installed = false
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    expect(unexpected, '흉내 내지 않은 요청이 나갔어요').toEqual([])
  })
}
