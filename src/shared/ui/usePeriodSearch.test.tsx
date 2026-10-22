import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation, useSearchParams } from 'react-router'
import { expect, test, vi } from 'vitest'
import { ApiError } from '@/shared/api'
import { periodErrors } from '@/shared/lib/period'
import { PeriodFields } from './PeriodFields'
import { usePeriodSearch } from './usePeriodSearch'

type Filters = { status?: string; from?: string; to?: string; page: number }

function readFilters(params: URLSearchParams): Filters {
  return {
    status: params.get('status') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    page: Number(params.get('page') ?? 0),
  }
}

function toSearch({ page, ...rest }: Filters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) params.set(key, value)
  }
  if (page > 0) params.set('page', String(page))
  const search = params.toString()
  return search ? `?${search}` : ''
}

type Options = { error?: unknown; onLocationChange?: () => void }

function setup({ error = null, onLocationChange }: Options = {}, initial = '/list') {
  const refetch = vi.fn()

  function Page() {
    const location = useLocation()
    const [searchParams, setSearchParams] = useSearchParams()
    const filters = readFilters(searchParams)
    const { draft, setDraft, errors, periodRef, apply, handleSubmit, periodRejected } =
      usePeriodSearch({
        filters,
        toSearch,
        draftOf: ({ from, to }) => ({ from: from ?? '', to: to ?? '' }),
        validate: periodErrors,
        fromDraft: ({ from, to }, { status }) => ({
          status,
          from: from || undefined,
          to: to || undefined,
        }),
        query: { refetch, error },
        invalidPeriodCodes: ['INVALID_PERIOD'],
        onLocationChange,
      })
    return (
      <>
        <form onSubmit={handleSubmit} noValidate>
          <PeriodFields
            ref={periodRef}
            labels={{ from: '시작일', to: '끝일' }}
            value={draft}
            onChange={setDraft}
            errors={errors}
          />
          <button type="submit">조회</button>
        </form>
        <button onClick={() => apply({ status: 'DONE' })}>끝난 것만</button>
        <button onClick={() => setSearchParams(toSearch({ ...filters, page: filters.page + 1 }))}>
          다음 페이지
        </button>
        <output aria-label="주소">{location.search}</output>
        {periodRejected && <p>기간 칸을 고쳐 주세요</p>}
      </>
    )
  }

  const router = createMemoryRouter([{ path: '/list', Component: Page }], {
    initialEntries: [initial],
  })
  render(<RouterProvider router={router} />)
  return { router, refetch }
}

const address = () => screen.getByLabelText('주소').textContent

test('조회하면 칸의 값과 지금 조건으로 주소를 바꾸고, 첫 페이지부터 본다', async () => {
  const { refetch } = setup({}, '/list?status=OPEN&page=2')

  await userEvent.type(screen.getByLabelText('시작일'), '2026-10-01')
  await userEvent.type(screen.getByLabelText('끝일'), '2026-10-16')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  expect(address()).toBe('?status=OPEN&from=2026-10-01&to=2026-10-16')
  expect(refetch).not.toHaveBeenCalled()
})

test('칸의 값이 틀리면 주소를 바꾸지 않고 칸 아래에 알린다', async () => {
  const { refetch } = setup({}, '/list?status=OPEN')

  await userEvent.type(screen.getByLabelText('시작일'), '2026-10-16')
  await userEvent.type(screen.getByLabelText('끝일'), '2026-10-01')
  await userEvent.click(screen.getByRole('button', { name: '끝난 것만' }))

  expect(screen.getByLabelText('끝일')).toHaveAccessibleDescription('끝일이 시작일보다 앞이에요.')
  expect(address()).toBe('?status=OPEN')
  expect(refetch).not.toHaveBeenCalled()
})

test('같은 조건으로 다시 조회하면 주소는 그대로 두고 새로 받는다', async () => {
  const { refetch } = setup({}, '/list?from=2026-10-01')

  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  expect(refetch).toHaveBeenCalledTimes(1)
  expect(address()).toBe('?from=2026-10-01')
})

test('다른 페이지에서 같은 조건으로 조회하면 첫 페이지로 옮긴다(새로 받기가 아니라)', async () => {
  const { refetch } = setup({}, '/list?from=2026-10-01&page=3')

  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  expect(address()).toBe('?from=2026-10-01')
  expect(refetch).not.toHaveBeenCalled()
})

test('바로 바뀌는 조건(칩)은 지금 조건 위에 덮이고, 칸에 넣다 만 값도 함께 적용한다', async () => {
  setup({}, '/list?status=OPEN&from=2026-10-01')

  await userEvent.type(screen.getByLabelText('끝일'), '2026-10-16')
  await userEvent.click(screen.getByRole('button', { name: '끝난 것만' }))

  expect(address()).toBe('?status=DONE&from=2026-10-01&to=2026-10-16')
})

test('다른 주소로 옮기면 칸을 그 조건으로 맞추고 오류를 지우며 onLocationChange를 부른다', async () => {
  const onLocationChange = vi.fn()
  const { router } = setup({ onLocationChange }, '/list?from=2026-10-01')

  await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
  expect(onLocationChange).toHaveBeenCalledTimes(1)

  await userEvent.type(screen.getByLabelText('끝일'), '2026-09-01')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))
  expect(screen.getByLabelText('끝일')).toHaveAccessibleDescription('끝일이 시작일보다 앞이에요.')
  // 틀린 값이라 옮기지 않았다. 넣던 값과 안내가 남는다.
  expect(onLocationChange).toHaveBeenCalledTimes(1)

  await act(() => router.navigate(-1))

  expect(address()).toBe('?from=2026-10-01')
  expect(screen.getByLabelText('시작일')).toHaveValue('2026-10-01')
  expect(screen.getByLabelText('끝일')).toHaveValue('')
  expect(screen.getByLabelText('끝일')).not.toHaveAccessibleDescription()
  expect(onLocationChange).toHaveBeenCalledTimes(2)
})

test('서버가 기간이 틀렸다고 거절하면 periodRejected다', () => {
  const rejected = new ApiError({ kind: 'http', status: 400, problem: { code: 'INVALID_PERIOD' } })

  setup({ error: rejected })
  expect(screen.getByText('기간 칸을 고쳐 주세요')).toBeInTheDocument()
})

test.each([
  ['다른 코드', new ApiError({ kind: 'http', status: 400, problem: { code: 'SOMETHING_ELSE' } })],
  ['코드 없음', new ApiError({ kind: 'http', status: 500 })],
  ['ApiError가 아님', new Error('boom')],
  ['오류 없음', null],
])('그 밖의 오류(%s)는 periodRejected가 아니다', (_, error) => {
  setup({ error })
  expect(screen.queryByText('기간 칸을 고쳐 주세요')).not.toBeInTheDocument()
})
