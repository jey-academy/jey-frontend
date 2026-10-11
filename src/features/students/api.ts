import {
  hashKey,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, useIdempotentPost } from '@/shared/api'
import { meQueryKey, type Me } from '@/shared/auth'
import type { components } from '@/shared/api/schema'

/** 목록의 한 줄. 학부모 전체가 아니라 대표 연락처만 있다. 전화번호는 서버가 가운데를 가려서 준다. */
export type StudentSummary = components['schemas']['StudentSummaryResponse']
export type StudentPage = components['schemas']['StudentPageResponse']
/** 학생 한 명의 전체 정보. 전화번호는 모두 서버가 가운데를 가려서 준다. */
export type Student = components['schemas']['StudentResponse']
export type StudentCreateRequest = components['schemas']['StudentCreateRequest']
export type StudentUpdateRequest = components['schemas']['StudentUpdateRequest']

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

const listKey = ['students', 'list'] as const
const detailKey = (id: number) => ['students', 'detail', id] as const

/**
 * 학생 한 명의 상세. 학부모, 형제, 대표 연락처가 들어 있다. id가 null이면 묻지 않는다.
 * `fresh`를 주면 받아 둔 것이 있어도 화면이 뜰 때 새로 받는다(수정 화면).
 */
export function useStudent(id: number | null, { fresh = false }: { fresh?: boolean } = {}) {
  return useQuery({
    queryKey: detailKey(id ?? 0),
    // skipToken이면 refetch를 불러도 요청이 나가지 않는다.
    queryFn:
      id === null
        ? skipToken
        : ({ signal }) => api.get<Student>(`/api/v1/students/${id}`, { signal }),
    // 값을 주지 않아야 앱의 기본 유지 시간을 따른다(undefined를 주면 기본값이 지워진다).
    ...(fresh ? { staleTime: 0 } : {}),
    networkMode: 'always',
  })
}

// 지금 로그인한 사람. 요청을 보낸 사람과 응답을 받는 사람이 같은지 볼 때 쓴다.
function currentUserId(queryClient: QueryClient) {
  return queryClient.getQueryData<Me | null>(meQueryKey)?.id
}

/**
 * 응답을 기다리는 사이에 로그아웃했거나 다른 사람이 로그인했는지.
 * 그랬다면 응답으로 온 학생 자료를 캐시에 남기지 않는다. 같은 기기를 이어 쓰는 다음 사람에게 보이면 안 된다.
 */
function userChanged(queryClient: QueryClient, sentBy: number | undefined) {
  const now = currentUserId(queryClient)
  return now === undefined || now !== sentBy
}

/**
 * 학생 등록. 학생과 학부모를 한 번에 등록한다.
 * 같은 전화번호의 학부모가 이미 있으면 서버가 새로 만들지 않고 그 학부모에 연결한다(응답의 linkedToExisting).
 */
export function useRegisterStudent() {
  const queryClient = useQueryClient()
  // 응답을 놓친 뒤 같은 내용으로 다시 눌러도 한 번만 등록되고, 처음의 응답(linkedToExisting 포함)을 받는다.
  const register = useIdempotentPost<StudentCreateRequest, Student>('/api/v1/students')
  return useMutation({
    mutationFn: register,
    // 누가 보낸 등록인지 적어 둔다.
    onMutate: () => ({ userId: currentUserId(queryClient) }),
    // 등록 결과 안내를 남긴다. 화면에서 mutate에 넘기는 onSuccess는 화면이 사라지면 불리지 않는다.
    // 응답을 기다리다 다른 화면으로 가도 안내(특히 기존 학부모에 연결했다는 안내)가 남도록 여기서 한다.
    onSuccess: (student, _body, context) => {
      if (userChanged(queryClient, context.userId)) return
      const notice: RegisteredNotice = {
        studentId: student.id,
        name: student.name,
        linkedGuardians: student.guardians
          .filter((guardian) => guardian.linkedToExisting)
          // 서버가 가려서 준 번호다.
          .map(({ id, relation, name, phone }) => ({ id, relation, name, phone })),
      }
      // 보는 화면이 없는 캐시는 기본 5분 뒤 지워진다. 상세나 목록 화면이 읽을 때까지 남겨 둔다.
      queryClient.setQueryDefaults(registeredNoticeKey, { gcTime: Infinity })
      queryClient.setQueryData(registeredNoticeKey, notice)
      // 상세 화면이 다시 묻지 않게 받은 응답을 넣어 둔다.
      queryClient.setQueryData(detailKey(student.id), student)
    },
    // 성공했든 실패했든 목록은 다시 받게 한다. 응답이 끊겼을 뿐 서버에는 등록됐을 수 있다.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: listKey }),
    // 요청 본문(전화번호 원문)이 mutation 캐시에 들어 있다. 기본값이면 화면을 떠난 뒤에도 5분 남는다.
    // 0으로 두어 등록 화면이 내려가는 즉시 지운다. 실패해서 고치는 동안에는 화면과 함께 남아 있다.
    gcTime: 0,
    networkMode: 'always',
  })
}

/**
 * 학생 정보 수정. 전화번호를 뺀 값을 통째로 바꾼다(보내지 않은 반과 학교는 비워진다).
 * 전화번호는 보냈을 때만 바뀐다. 응답으로 받은 가린 번호를 다시 보내면 서버가 거부한다.
 */
export function useUpdateStudent(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: StudentUpdateRequest) => api.put<Student>(`/api/v1/students/${id}`, body),
    onMutate: () => ({ userId: currentUserId(queryClient) }),
    // 받은 응답을 상세에 바로 넣는다. 상세로 돌아갔을 때 고치기 전 값이 잠깐 보이지 않게 한다.
    onSuccess: async (student, _body, context) => {
      // 저장 전에 보낸 조회가 늦게 도착해 고치기 전 값으로 덮어쓰지 못하게 한다.
      await queryClient.cancelQueries({ queryKey: detailKey(id) })
      if (userChanged(queryClient, context.userId)) {
        // 응답을 넣지 않았으니 받아 둔 상세는 고치기 전 값이다. 다시 받게 한다.
        void queryClient.invalidateQueries({ queryKey: detailKey(id) })
        return
      }
      queryClient.setQueryData(detailKey(id), student)
    },
    // 응답을 받지 못한 실패라면 서버에는 저장됐을 수 있다. 어떤 실패든 상세를 다시 받게 한다(폼의 입력은 그대로다).
    onError: () => void queryClient.invalidateQueries({ queryKey: detailKey(id) }),
    // 이름·학년·반·상태가 목록에 보이고, 형제의 상세에도 이름과 상태가 보인다.
    // 이 학생의 상세만 빼고 학생 자료를 모두 낡은 것으로 표시한다(화면이 보고 있는 것은 바로 다시 받는다).
    // 이 학생의 상세는 성공하면 응답을 넣었고 실패하면 onError가 다시 받게 하므로 여기서는 뺀다.
    onSettled: () =>
      void queryClient.invalidateQueries({
        queryKey: ['students'],
        predicate: (query) => query.queryHash !== hashKey(detailKey(id)),
      }),
    // 새 전화번호 원문이 본문에 있을 수 있다. 등록과 같은 이유로 화면이 내려가는 즉시 지운다.
    gcTime: 0,
    networkMode: 'always',
  })
}

/** 학생 본인 번호 지우기. 마지막 연락처면 서버가 거부한다(MEMBER_LAST_CONTACT). */
export function useRemoveStudentPhone(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete<void>(`/api/v1/students/${id}/phone`),
    // 응답에 학생이 오지 않는다. 받아 둔 상세의 번호를 바로 비워, 다시 받기에 실패해도 지운 번호가 보이지 않게 한다.
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: detailKey(id) })
      queryClient.setQueryData<Student>(detailKey(id), (student) =>
        student ? { ...student, phone: null } : student,
      )
    },
    // 성공했든 실패했든 학생 자료를 다시 받는다(응답이 끊겼을 뿐 지워졌을 수 있다).
    // 다시 받기가 끝나기를 기다리지 않는다. 기다리면 그동안 지우는 중으로 남는다.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['students'] }),
    networkMode: 'always',
  })
}

/** 방금 등록한 학생에 대한 안내. 등록이 성공하면 남기고 상세나 목록 화면이 한 번 보여준다. */
export type RegisteredNotice = {
  studentId: number
  name: string
  /** 새로 만들지 않고 이미 있던 학부모에 연결한 경우. 이름은 입력한 것이 아니라 저장돼 있던 것이다. */
  linkedGuardians: Pick<Student['guardians'][number], 'id' | 'relation' | 'name' | 'phone'>[]
}

const registeredNoticeKey = ['students', 'registered-notice'] as const
const registeredNoticeHash = hashKey(registeredNoticeKey)

/**
 * 등록 결과 안내를 한 번 보여준다. [안내, 닫기]를 돌려준다.
 * `studentId`를 주면 그 학생의 안내만 꺼낸다(상세 화면). 주지 않으면 어느 학생의 안내든 꺼낸다(목록 화면).
 * 학생·학부모 이름이 들어 있어 주소나 브라우저 기록에 두지 않고 캐시에 둔다.
 * 읽자마자 캐시에서 지우므로 다른 화면에 갔다 돌아오면 다시 뜨지 않는다.
 * 읽지 못한 안내도 로그아웃할 때 다른 자료와 함께 지워진다.
 */
export function useRegisteredNotice(
  studentId?: number,
): [RegisteredNotice | undefined, () => void] {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState(() => {
    const left = queryClient.getQueryData<RegisteredNotice>(registeredNoticeKey)
    return left && (studentId === undefined || left.studentId === studentId) ? left : undefined
  })

  useEffect(() => {
    const mine = (left: RegisteredNotice | undefined): left is RegisteredNotice =>
      left !== undefined && (studentId === undefined || left.studentId === studentId)
    // 화면에 옮겨 담았으니 남겨 둔 것은 지운다. 다른 학생의 안내는 그대로 둔다.
    if (mine(queryClient.getQueryData<RegisteredNotice>(registeredNoticeKey))) {
      queryClient.removeQueries({ queryKey: registeredNoticeKey })
    }
    // 응답을 기다리다 이 화면(목록)으로 먼저 온 경우, 화면이 떠 있는 동안 등록이 끝난다. 그때도 바로 보여준다.
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.query.queryHash !== registeredNoticeHash) return
      const arrived = event.query.state.data as RegisteredNotice | undefined
      if (!mine(arrived)) return
      setNotice(arrived)
      queryClient.removeQueries({ queryKey: registeredNoticeKey })
    })
  }, [queryClient, studentId])

  return [notice, () => setNotice(undefined)]
}
