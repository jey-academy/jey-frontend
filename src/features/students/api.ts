import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '@/shared/api'
import type { components } from '@/shared/api/schema'

/** 목록의 한 줄. 학부모 전체가 아니라 대표 연락처만 있다. 전화번호는 서버가 가운데를 가려서 준다. */
export type StudentSummary = components['schemas']['StudentSummaryResponse']
export type StudentPage = components['schemas']['StudentPageResponse']
/** 학생 한 명의 전체 정보. 전화번호는 모두 서버가 가운데를 가려서 준다. */
export type Student = components['schemas']['StudentResponse']
export type StudentCreateRequest = components['schemas']['StudentCreateRequest']

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

/**
 * 학생 등록. 학생과 학부모를 한 번에 등록한다.
 * 같은 전화번호의 학부모가 이미 있으면 서버가 새로 만들지 않고 그 학부모에 연결한다(응답의 linkedToExisting).
 */
export function useRegisterStudent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: StudentCreateRequest) => api.post<Student>('/api/v1/students', body),
    // 성공했든 실패했든 목록은 다시 받게 한다. 응답이 끊겼을 뿐 서버에는 등록됐을 수 있다.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['students', 'list'] }),
    // 요청 본문에 입력한 전화번호 원문이 들어 있다. 요청 기록에 남지 않게 끝나는 대로 지운다.
    gcTime: 0,
    networkMode: 'always',
  })
}

/** 방금 등록한 학생에 대한 안내. 등록 화면이 남기고 목록 화면이 한 번 보여준다. */
export type RegisteredNotice = {
  name: string
  /** 새로 만들지 않고 이미 있던 학부모에 연결한 경우. 이름은 입력한 것이 아니라 저장돼 있던 것이다. */
  linkedGuardians: {
    relation: Student['guardians'][number]['relation']
    name: string
    phone: string
  }[]
}

const registeredNoticeKey = ['students', 'registered-notice'] as const

/**
 * 등록 결과를 등록 화면에서 목록 화면으로 넘긴다.
 * 주소나 브라우저 기록에 두지 않고 캐시에 둔다. 학생·학부모 이름이 들어 있고, 로그아웃하면 다른 자료와 함께 지워진다.
 */
export function useRegisteredNotice() {
  const queryClient = useQueryClient()
  return useMemo(
    () => ({
      show: (student: Student) => {
        const notice: RegisteredNotice = {
          name: student.name,
          linkedGuardians: student.guardians
            .filter((guardian) => guardian.linkedToExisting)
            // 서버가 가려서 준 번호다.
            .map(({ relation, name, phone }) => ({ relation, name, phone })),
        }
        queryClient.setQueryData(registeredNoticeKey, notice)
      },
      /** 남겨 둔 안내를 읽는다. 없으면 undefined. */
      peek: () => queryClient.getQueryData<RegisteredNotice>(registeredNoticeKey),
      /** 남겨 둔 안내를 지운다. 한 번 보여준 뒤에 부른다. */
      clear: () => queryClient.removeQueries({ queryKey: registeredNoticeKey }),
    }),
    [queryClient],
  )
}
