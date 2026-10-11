import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { components } from '@/shared/api/schema'

/** 목록의 한 줄. 학부모 전체가 아니라 대표 연락처만 있다. 전화번호는 서버가 가운데를 가려서 준다. */
export type StudentSummary = components['schemas']['StudentSummaryResponse']
export type StudentPage = components['schemas']['StudentPageResponse']

export type StudentFilters = {
  /** 없으면 전 지점 */
  campusId?: number
  /** 이름의 앞부분 ("김"으로 "김철수"를 찾는다) */
  name?: string
  /** 0부터 */
  page: number
}

type StudentListKey = readonly ['students', 'list', StudentFilters]

/**
 * 학생 목록의 한 페이지. 이름 순이고 퇴원한 학생도 들어 있다.
 * 전화번호 뒷자리 검색은 쓰지 않는다. API가 쿼리 문자열로 받는데, 전화번호는 뒷자리라도 주소에 남기지 않는다.
 */
export function useStudents({ campusId, name, page }: StudentFilters) {
  const queryKey: StudentListKey = ['students', 'list', { campusId, name: name || undefined, page }]

  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.get<StudentPage>('/api/v1/students', {
        query: { campusId, name: name || undefined, page },
        signal,
      }),
    // 같은 조건에서 페이지만 넘길 때는, 다음 페이지를 받는 동안 이전 페이지를 그대로 보여준다(표가 사라졌다 나타나지 않게).
    // 지점이나 이름이 바뀌었을 때는 보여주지 않는다. 이전 조건의 학생이 새 조건의 결과처럼 보이고,
    // 이전 조건의 "학생이 없어요"가 새 조건의 답처럼 보이기 때문이다.
    placeholderData: (previous, previousQuery) => {
      const before = (previousQuery?.queryKey as StudentListKey | undefined)?.[2]
      const sameFilters = before?.campusId === campusId && before?.name === (name || undefined)
      return sameFilters ? previous : undefined
    },
    // 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 그러면 안내 없이 멈춰 보이므로 바로 시도해 실패를 알린다.
    networkMode: 'always',
  })
}
