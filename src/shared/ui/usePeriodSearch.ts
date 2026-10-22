import { useRef, useState, type FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { ApiError } from '@/shared/api'
import type { Period, PeriodErrors } from '@/shared/lib/period'
import type { PeriodFieldsHandle } from './PeriodFields'

type PeriodSearchOptions<F extends { page: number }, D extends Period, E extends PeriodErrors> = {
  /** 주소에서 읽은 지금 조건 */
  filters: F
  /** 조건을 주소(`?from=…`)로 바꾼다. 같은 조건이면 같은 글자여야 한다. */
  toSearch: (filters: F) => string
  /** 조건을 칸의 값으로 바꾼다. 주소가 바뀔 때마다 칸을 이 값으로 맞춘다. */
  draftOf: (filters: F) => D
  /** 칸의 오류. 비어 있어야 적용한다. `badInput`은 칸에 날짜로 읽히지 않는 글자가 있는지다. */
  validate: (draft: D, badInput: Record<keyof Period, boolean>) => E
  /** 칸의 값과 지금 조건으로 새 조건을 만든다(페이지는 훅이 첫 페이지로 정한다). */
  fromDraft: (draft: D, filters: F) => Omit<F, 'page'>
  /** 목록 조회. 같은 조건으로 다시 적용하면 새로 받는다. */
  query: { refetch: () => unknown; error: unknown }
  /** 서버가 기간이 틀렸다고 거절하는 오류 코드. 다시 불러와도 같은 답이다. */
  invalidPeriodCodes?: readonly string[]
  /** 다른 주소로 옮길 때 함께 지울 것(취소 안내 등). 렌더 도중에 불린다. */
  onLocationChange?: () => void
}

/**
 * 기간으로 찾는 목록 화면의 조건 흐름. 칸에 넣는 값은 "조회"를 눌러야 주소의 조건이 된다.
 * 조건은 주소에 둔다. 새로고침하거나 뒤로 가기로 돌아와도 보던 자리가 유지된다.
 * 칩처럼 누르면 바로 바뀌는 조건은 `apply({ status })`로 넘긴다. 칸에 넣다 만 값도 함께 적용하고,
 * 틀린 값이 있으면 칩도 바뀌지 않는다(화면에 보이는 조건과 표가 어긋나지 않게).
 */
export function usePeriodSearch<
  F extends { page: number },
  D extends Period,
  E extends PeriodErrors = PeriodErrors,
>({
  filters,
  toSearch,
  draftOf,
  validate,
  fromDraft,
  query,
  invalidPeriodCodes = [],
  onLocationChange,
}: PeriodSearchOptions<F, D, E>) {
  const location = useLocation()
  const [, setSearchParams] = useSearchParams()
  const periodRef = useRef<PeriodFieldsHandle>(null)
  const [draft, setDraft] = useState<D>(() => draftOf(filters))
  const [errors, setErrors] = useState<Partial<E>>({})

  // 다른 주소로 옮길 때마다(조회, 칩, 페이지, 뒤로 가기) 칸을 적용된 조건으로 맞춘다.
  // 넣다 만 값을 남겨 두면 칸에 보이는 조건과 표가 어긋난다.
  // 렌더 도중에 setState를 부르는 것은 의도한 것이다(React의 "값이 바뀔 때 state 맞추기" 방식).
  // React가 이 렌더를 버리고 곧바로 다시 그리므로, useEffect로 맞출 때처럼 옛 값이 한 번 보이지 않는다.
  // key로 폼을 새로 만드는 방법도 있지만, 값만 바꾸면 누르던 자리(포커스)가 유지된다.
  // location.key는 옮길 때마다 바뀐다. 오류가 있어 옮기지 않았을 때는 그대로라 넣던 값과 안내가 남는다.
  const [syncedWith, setSyncedWith] = useState(location.key)
  if (syncedWith !== location.key) {
    setSyncedWith(location.key)
    setDraft(draftOf(filters))
    setErrors({})
    onLocationChange?.()
  }

  /** 칸의 값을 조건으로 적용한다. overrides가 그 위에 덮인다. 늘 첫 페이지부터 본다. */
  function apply(overrides: Partial<Omit<F, 'page'>> = {}) {
    const found = validate(draft, periodRef.current?.badInput() ?? { from: false, to: false })
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const next = toSearch({ ...fromDraft(draft, filters), ...overrides, page: 0 } as F)
    // 같은 조건이면 주소가 바뀌지 않아 요청도 나가지 않는다. 그동안 바뀐 것을 보려고 다시 누른 것이므로 새로 받는다.
    if (next === toSearch(filters)) void query.refetch()
    else setSearchParams(next)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    apply()
  }

  const { error } = query
  // 주소를 손으로 고쳐 틀린 기간으로 들어온 경우다. 다시 불러와도 같은 답이라, 화면은 기간 칸을 고치게 안내한다.
  const periodRejected =
    error instanceof ApiError && error.code !== null && invalidPeriodCodes.includes(error.code)

  return { draft, setDraft, errors, periodRef, apply, handleSubmit, periodRejected }
}
