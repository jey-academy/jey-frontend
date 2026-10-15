import {
  hashKey,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { api, ApiError, isOutcomeUnknown, useIdempotentPost } from '@/shared/api'
import { meQueryKey, type Me } from '@/shared/auth'
import type { components } from '@/shared/api/schema'
import type { Relation } from './labels'

/** 목록의 한 줄. 학부모 전체가 아니라 대표 연락처만 있다. 전화번호는 서버가 가운데를 가려서 준다. */
export type StudentSummary = components['schemas']['StudentSummaryResponse']
export type StudentPage = components['schemas']['StudentPageResponse']
/** 학생 한 명의 전체 정보. 전화번호는 모두 서버가 가운데를 가려서 준다. */
export type Student = components['schemas']['StudentResponse']
type StudentSearchRequest = components['schemas']['StudentSearchRequest']
export type StudentCreateRequest = components['schemas']['StudentCreateRequest']
export type StudentUpdateRequest = components['schemas']['StudentUpdateRequest']
/** 학생에게 연결된 학부모. 전화번호는 서버가 가운데를 가려서 준다. */
export type Guardian = Student['guardians'][number]
export type GuardianRequest = components['schemas']['GuardianRequest']
export type GuardianUpdateRequest = components['schemas']['GuardianUpdateRequest']
type RelationUpdateRequest = components['schemas']['RelationUpdateRequest']
type GuardianProfile = components['schemas']['GuardianProfileResponse']
type PhoneReveal = components['schemas']['PhoneRevealResponse']

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
 * 조회인데 POST다. 조건(학생 이름)이 요청 주소에 실려 브라우저 기록과 접근 로그에 남지 않게, 서버가 본문으로 받는다.
 * 주소에 쿼리 문자열을 붙이면 서버가 거부한다(400). 바꾸는 자료가 없어 멱등 키는 싣지 않고, 실패하면 다시 보내도 된다.
 * 전화번호 뒷자리 검색(phoneLast4)은 아직 화면에 없다.
 */
export function useStudents({ campusId, name, page }: StudentFilters) {
  const queryKey: StudentListKey = ['students', 'list', { campusId, name: name || undefined, page }]

  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.post<StudentPage>(
        '/api/v1/students/search',
        // 값이 없는 조건은 빠진다(undefined는 JSON에 실리지 않는다). 조건이 하나도 없어도 본문은 있어야 한다.
        { campusId, name: name || undefined, page } satisfies StudentSearchRequest,
        { signal },
      ),
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
  // 서버가 Idempotency-Key를 지키면(백엔드 ADR-0027), 등록은 됐는데 응답만 놓친 뒤 같은 내용으로 다시 눌러도
  // 한 번만 등록되고 처음의 응답(linkedToExisting 포함)을 받는다.
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
      leaveNotice(queryClient, registeredNoticeKey, notice)
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
    onSuccess: () => patchStudent(queryClient, id, (student) => ({ ...student, phone: null })),
    // 성공했든 실패했든 학생 자료를 다시 받는다(응답이 끊겼을 뿐 지워졌을 수 있다).
    // 다시 받기가 끝나기를 기다리지 않는다. 기다리면 그동안 지우는 중으로 남는다.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['students'] }),
    networkMode: 'always',
  })
}

/**
 * 받아 둔 상세를 서버에서 다시 받지 않고 화면이 직접 고친다(성공 응답에 학생이 오지 않는 요청).
 * 받은 시각(dataUpdatedAt)은 그대로 둔다. 그 시각을 서버에서 받은 때로 보는 곳이 있다(`useUnsureGuardianAdd`의 checked).
 * 고친 곳 말고는 받았던 그대로라, 이것으로 학생을 다시 받은 것으로 보면 안 된다.
 */
async function patchStudent(
  queryClient: QueryClient,
  id: number,
  patch: (student: Student) => Student,
) {
  // 저장 전에 보낸 조회가 늦게 도착해 고친 것을 덮어쓰지 못하게 한다.
  await queryClient.cancelQueries({ queryKey: detailKey(id) })
  queryClient.setQueryData<Student>(
    detailKey(id),
    (student) => (student ? patch(student) : student),
    { updatedAt: queryClient.getQueryState(detailKey(id))?.dataUpdatedAt },
  )
}

/**
 * 학부모를 고친 응답(학생)을 그 학생의 상세에 넣는다.
 * `guardianId`를 주면 그 학부모에 대한 응답이다. 받아 둔 상세에 그 학부모가 없으면 넣지 않고 다시 받는다.
 * 응답을 기다리는 사이 다시 받은 학생에서 그 학부모가 빠졌다면(다른 곳에서 연결이 끊김) 응답이 더 낡았다.
 * 그대로 넣으면 끊긴 학부모가 표에 되살아난다.
 */
async function storeStudent(
  queryClient: QueryClient,
  student: Student,
  sentBy: number | undefined,
  guardianId?: number,
) {
  // 저장 전에 보낸 조회가 늦게 도착해 고치기 전 값으로 덮어쓰지 못하게 한다.
  await queryClient.cancelQueries({ queryKey: detailKey(student.id) })
  const gone =
    guardianId !== undefined &&
    !queryClient
      .getQueryData<Student>(detailKey(student.id))
      ?.guardians.some(({ id }) => id === guardianId)
  if (gone || userChanged(queryClient, sentBy)) {
    // 응답을 넣지 않았으니 받아 둔 상세는 낡았을 수 있다. 다시 받게 한다.
    void queryClient.invalidateQueries({ queryKey: detailKey(student.id) })
    return
  }
  queryClient.setQueryData(detailKey(student.id), student)
}

// 학부모를 붙이거나 관계를 바꾸면 목록의 대표 연락처와, 같은 학부모를 가진 학생의 형제 목록이 바뀔 수 있다.
// 이 학생의 상세만 빼고 학생 자료를 모두 낡은 것으로 표시한다(화면이 보고 있는 것은 바로 다시 받는다).
// 이 학생의 상세는 성공하면 응답을 넣었고 실패하면 onError가 다시 받게 하므로 뺀다.
function refreshOtherStudents(queryClient: QueryClient, id: number) {
  void queryClient.invalidateQueries({
    queryKey: ['students'],
    predicate: (query) => query.queryHash !== hashKey(detailKey(id)),
  })
}

/**
 * 학생에게 학부모 추가. 같은 전화번호의 학부모가 이미 있으면 서버가 새로 만들지 않고 그 학부모를 붙인다.
 * 그때 응답의 그 학부모는 linkedToExisting이 true이고 이름은 저장돼 있던 이름이다.
 * 성공하면 추가 결과 안내(`GuardianAddedNotice`)를 남긴다. 그 학생의 상세 화면이 읽어 보여준다.
 * 추가됐는지 알 수 없게 끝나면(응답 없음, 서버 오류) 그 사실(`UnsureGuardianAdd`)을 남긴다. 이것도 상세 화면이 읽는다.
 */
export function useAddGuardian(studentId: number) {
  const queryClient = useQueryClient()
  const add = useIdempotentPost<GuardianRequest, Student>(`/api/v1/students/${studentId}/guardians`)
  return useMutation({
    mutationFn: add,
    onMutate: () => ({
      userId: currentUserId(queryClient),
      // 보내기 전에 연결돼 있던 학부모. 결과를 알 수 없게 끝나면, 다시 받은 학생과 견줄 기준이 된다.
      knownIds: queryClient
        .getQueryData<Student>(detailKey(studentId))
        ?.guardians.map((guardian) => guardian.id),
    }),
    // 요청 본문에는 전화번호 원문이 있다. 이름만 꺼내 쓴다(안내에 원문이 섞여 들어갈 길을 두지 않는다).
    onSuccess: async (student, { name: typedName }, context) => {
      await storeStudent(queryClient, student, context.userId)
      if (userChanged(queryClient, context.userId)) return
      // 추가 결과 안내를 남긴다. 창이나 화면이 사라지면 그쪽 코드는 안내를 둘 곳(state)이 없다.
      // 응답을 기다리다 다른 화면으로 가도 안내(특히 기존 학부모에 연결했다는 안내)가 남도록 여기서 캐시에 둔다.
      // linkedToExisting은 방금 붙인 학부모에게만 true로 온다.
      const linked = student.guardians.find((guardian) => guardian.linkedToExisting)
      const notice: GuardianAddedNotice = {
        studentId: student.id,
        typedName,
        // 서버가 가려서 준 번호다.
        linked: linked && { id: linked.id, name: linked.name, phone: linked.phone },
      }
      leaveNotice(queryClient, guardianAddedNoticeKey(student.id), notice)
      // 앞서 알 수 없게 끝난 시도가 있었다면, 이 응답이 설명하는 학부모는 이제 아는 학부모다.
      settleUnsureAdd(queryClient, student, notice, context.knownIds)
    },
    onError: (error, { name: typedName }, context) => {
      // 화면이 사라진 뒤에도 불린다. 응답을 기다리다 다른 화면으로 갔어도 "알 수 없음"이 남는다.
      if (isOutcomeUnknown(error) && context && !userChanged(queryClient, context.userId)) {
        leaveUnsureAdd(queryClient, studentId, typedName, context.knownIds ?? [])
      }
      // 응답을 받지 못한 실패라면 서버에는 추가됐을 수 있다. 상세를 다시 받는다.
      void queryClient.invalidateQueries({ queryKey: detailKey(studentId) })
    },
    onSettled: () => refreshOtherStudents(queryClient, studentId),
    // 요청 본문에 전화번호 원문이 있다. 등록과 같은 이유로, 이 훅을 쓰는 폼이 내려가면 바로 지운다.
    gcTime: 0,
    networkMode: 'always',
  })
}

/** 이 학생에게 누구인지(관계)만 바꾼다. 같은 학부모가 형제에게는 다른 관계일 수 있다. */
export function useChangeGuardianRelation(studentId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ guardianId, relation }: { guardianId: number; relation: Relation }) =>
      api.put<Student>(`/api/v1/students/${studentId}/guardians/${guardianId}`, {
        relation,
      } satisfies RelationUpdateRequest),
    onMutate: () => ({ userId: currentUserId(queryClient) }),
    // 응답이 늦게 와서 그 사이 연결이 끊긴 것이 보였으면 넣지 않는다(storeStudent).
    onSuccess: (student, { guardianId }, context) =>
      storeStudent(queryClient, student, context.userId, guardianId),
    // 그 사이 연결이 끊겼을 수 있다(404). 어떤 실패든 상세를 다시 받는다.
    onError: () => void queryClient.invalidateQueries({ queryKey: detailKey(studentId) }),
    // 관계에 따라 대표 연락처가 바뀔 수 있고(어머니 우선), 목록은 대표의 관계도 보여준다.
    onSettled: () => refreshOtherStudents(queryClient, studentId),
    networkMode: 'always',
  })
}

/**
 * 학부모의 이름·전화번호 수정. 그 학부모에 연결된 모든 학생(형제)에게 반영된다.
 * 전화번호는 보냈을 때만 바뀐다. 응답으로 받은 가린 번호를 다시 보내면 서버가 거부한다.
 */
export function useUpdateGuardian() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ guardianId, body }: { guardianId: number; body: GuardianUpdateRequest }) =>
      api.put<GuardianProfile>(`/api/v1/guardians/${guardianId}`, body),
    // 응답에 학생이 오지 않는다. 성공했든 실패했든 학생 자료를 모두 낡은 것으로 표시한다(형제의 상세, 목록의 대표 연락처 포함).
    // 다시 받기가 끝나기를 기다리지 않는다. 기다리면 그동안 저장하는 중으로 남는다.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['students'] }),
    // 새 전화번호 원문이 본문에 있을 수 있다.
    gcTime: 0,
    networkMode: 'always',
  })
}

/**
 * 학생과 학부모의 연결 끊기. 학부모 자료는 남고 이 학생에게서만 떨어진다(다른 학생과의 연결은 그대로다).
 * 마지막 연락처면 서버가 거부한다(MEMBER_LAST_CONTACT).
 */
export function useUnlinkGuardian(studentId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (guardianId: number) => {
      try {
        await api.delete<void>(`/api/v1/students/${studentId}/guardians/${guardianId}`)
      } catch (error) {
        // 이미 끊긴 학부모다(두 번 눌렀거나 다른 직원이 먼저 끊었다). 바라던 결과이므로 성공으로 본다.
        if (error instanceof ApiError && error.code === 'MEMBER_GUARDIAN_NOT_FOUND') return
        throw error
      }
    },
    // 받아 둔 상세의 학부모 목록에서 바로 뺀다. 대표 연락처와 형제는 다시 받아야 맞는다.
    onSuccess: (_data, guardianId) =>
      patchStudent(queryClient, studentId, (student) => ({
        ...student,
        guardians: student.guardians.filter(({ id }) => id !== guardianId),
      })),
    // 대표 연락처와 형제가 바뀔 수 있고, 응답만 받지 못했을 뿐 연결은 끊겼을 수 있다. 학생 자료를 모두 낡은 것으로 표시한다.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['students'] }),
    networkMode: 'always',
  })
}

/**
 * 가리지 않은 전체 전화번호 보기. `guardianId`를 주면 그 학부모의 번호, 주지 않으면 학생 본인의 번호다.
 * 볼 때마다 서버에 누가 누구의 번호를 봤는지 남고 그 계정의 횟수에 든다.
 * 없는 대상(404)이나 서버 오류로 끝난 요청도 한 번으로 센다.
 * 사용자가 눌렀을 때만 부르고, 실패해도 알아서 다시 보내지 않는다.
 * 받은 번호는 쿼리 캐시에 넣지 않는다. 화면이 보여주기만 하고 떠나면 버린다.
 */
export function useRevealPhone(studentId: number, guardianId?: number) {
  const queryClient = useQueryClient()
  const owner =
    guardianId === undefined
      ? `/api/v1/students/${studentId}`
      : `/api/v1/students/${studentId}/guardians/${guardianId}`
  return useMutation({
    mutationFn: async () => {
      const body = await api.post<PhoneReveal | undefined>(`${owner}/phone/reveal`)
      // 번호가 없는 성공 응답은 실패로 본다. 그대로 두면 서버는 한 번으로 셌는데 화면에는 번호도 안내도 없다.
      if (typeof body?.phone !== 'string' || body.phone === '') {
        throw new ApiError({ kind: 'parse', status: 200 })
      }
      return body
    },
    // 그 사이 번호가 지워졌거나 연결이 끊겼다(404). 받아 둔 상세가 낡았으니 다시 받는다.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        void queryClient.invalidateQueries({ queryKey: detailKey(studentId) })
      }
    },
    // mutation은 원래 다시 보내지 않지만, 기본값이 바뀌어도 이 요청만은 다시 나가지 않게 적어 둔다(횟수를 쓴다).
    retry: false,
    // 응답(전체 번호)이 mutation 캐시에 들어 있다. 기본값이면 떼어 낸 뒤에도 5분 남는다.
    // 0으로 두어, 화면이 받은 직후 reset()으로 떼어 내거나 내려가면 바로 지워지게 한다.
    gcTime: 0,
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

/** 방금 추가한 학부모에 대한 안내. 추가가 성공하면 남기고 그 학생의 상세 화면이 한 번 보여준다. */
export type GuardianAddedNotice = {
  studentId: number
  /** 입력한 이름. 기존 학부모에 연결했으면 서버에 쓰이지 않았다 */
  typedName: string
  /** 새로 만들지 않고 이미 있던 학부모에 연결한 경우. 이름은 입력한 것이 아니라 저장돼 있던 것이다. */
  linked?: Pick<Guardian, 'id' | 'name' | 'phone'>
}

/**
 * 추가됐는지 알 수 없게 끝난 학부모 추가(응답 없음, 서버 오류). 다시 받은 학생(조회)에서는 linkedToExisting이 항상
 * false라, 기존 학부모에 연결됐는지는 확인할 길이 없다. 시도하기 전의 학부모와 입력한 이름을 적어 두고,
 * 다시 받은 학생과 견주어 알린다. 전화번호는 담지 않는다.
 */
export type UnsureGuardianAdd = {
  /** 알 수 없게 끝난 시도들에서 입력한 이름. 이름을 고쳐 다시 보냈으면 여럿이다 */
  typedNames: string[]
  /** 이 학생에게 연결돼 있다고 알고 있는 학부모. 여기에 없는 학부모가 보이면 놓친 추가로 붙은 것으로 본다 */
  knownIds: number[]
  /**
   * 받은 학생에 들어 있어 놓친 추가로 붙은 것으로 본 학부모. 그 학부모가 나중에 빠지면(연결 끊기의 응답을 놓쳤거나
   * 다른 직원이 끊음) 추가는 됐던 것이다. "추가되지 않았을 수 있어요"라고 알리지 않는다.
   */
  seenIds: number[]
  /** 마지막으로 알 수 없게 끝난 시각(ms). 그 뒤에 학생을 다시 받았는지 볼 때 쓴다 */
  failedAt: number
}

const unsureAddPrefix = ['students', 'guardian-add-unsure'] as const
const unsureAddKey = (studentId: number) => [...unsureAddPrefix, studentId] as const

// 알 수 없게 끝난 시도를 적어 둔다. 이미 적어 둔 것이 있으면 이름만 더한다.
// 다시 눌러 또 응답을 받지 못해도, 처음 시도하기 전의 학부모를 기준으로 둔다
// (그 사이 다시 받은 학생에는 이미 추가된 학부모가 들어 있을 수 있다).
// 이름은 모아 둔다. 이름을 고쳐 다시 보냈으면 어느 시도로 붙은 학부모인지 알 수 없다.
function leaveUnsureAdd(
  queryClient: QueryClient,
  studentId: number,
  typedName: string,
  knownIds: number[],
) {
  // 보는 화면이 없는 캐시는 기본 5분 뒤 지워진다. 화면이 읽고 닫을 때까지 남겨 둔다.
  queryClient.setQueryDefaults(unsureAddPrefix, { gcTime: Infinity })
  const before = queryClient.getQueryData<UnsureGuardianAdd | null>(unsureAddKey(studentId))
  queryClient.setQueryData<UnsureGuardianAdd>(unsureAddKey(studentId), {
    typedNames: [...new Set([...(before?.typedNames ?? []), typedName])],
    knownIds: before?.knownIds ?? knownIds,
    seenIds: before?.seenIds ?? [],
    failedAt: Date.now(),
  })
}

// 추가가 성공했다. 앞서 알 수 없게 끝난 시도가 있었다면, 이 응답이 설명하는 학부모를 아는 학부모에 더한다.
// 그대로 다시 눌러 성공했으면(같은 키라 처음의 응답이 온다) 늘어난 학부모는 그 한 명뿐이라 모르는 학부모가 남지 않는다.
// 내용을 고쳐 다시 보내 성공했으면(새 요청이다) 처음 시도로 붙은 학부모가 남는다. 그 학부모는 계속 알려야 한다.
// `sentKnownIds`는 이번 요청을 보내기 전에 보이던 학부모다.
function settleUnsureAdd(
  queryClient: QueryClient,
  student: Student,
  added: GuardianAddedNotice,
  sentKnownIds: number[] | undefined,
) {
  const unsure = queryClient.getQueryData<UnsureGuardianAdd | null>(unsureAddKey(student.id))
  if (!unsure) return
  const newcomers = student.guardians.filter((guardian) => !unsure.knownIds.includes(guardian.id))
  // 이 응답이 설명하는 학부모는 이번 요청을 보내기 전에 없던 학부모 가운데 있다. 이름을 그대로 두고 번호만 고쳐 보냈으면
  // 처음 시도로 붙은 학부모도 같은 이름이라, 그 학부모를 빼고 찾아야 한다.
  // 그 가운데 아무도 없으면 같은 키로 다시 보내 처음의 응답을 받은 것이다. 그 학부모는 보내기 전에 이미 보였다.
  const fresh = newcomers.filter((guardian) => !sentKnownIds?.includes(guardian.id))
  const candidates = fresh.length > 0 ? fresh : newcomers
  // 새로 만든 학부모는 안내에 ID가 없다. 한 명만 늘었으면 그 한 명이고, 더 늘었으면 입력한 이름의 한 명이다.
  const explained = added.linked
    ? added.linked.id
    : candidates.length === 1
      ? candidates[0].id
      : candidates.find((guardian) => guardian.name === added.typedName)?.id
  const knownIds: number[] =
    explained === undefined ? unsure.knownIds : [...unsure.knownIds, explained]
  const left = newcomers.filter((guardian) => guardian.id !== explained)
  const next: UnsureGuardianAdd | null = left.length === 0 ? null : { ...unsure, knownIds }
  queryClient.setQueryData<UnsureGuardianAdd | null>(unsureAddKey(student.id), next)
}

/**
 * 기록을 받은 학생에 맞춘다. 바꿀 것이 없으면 받은 기록을 그대로 돌려준다.
 * 새로 보인 학부모는 적어 두고(seenIds), 적어 둔 학부모가 빠졌으면 아는 학부모로 옮긴다.
 * 그렇게 해서 모르는 학부모가 남지 않으면 추가는 설명됐으니 기록을 비운다(null).
 * 실패한 뒤 다른 직원이 붙였다 끊은 학부모도 놓친 추가로 붙었던 학부모로 본다. 가려낼 방법이 없어,
 * 그때는 추가되지 않았는데도 "보이지 않아요" 안내가 뜨지 않는다.
 */
function reconcileUnsureAdd(
  record: UnsureGuardianAdd,
  guardians: readonly Guardian[],
): UnsureGuardianAdd | null {
  const ids = guardians.map(({ id }) => id)
  const appeared = ids.filter((id) => !record.knownIds.includes(id) && !record.seenIds.includes(id))
  const left = record.seenIds.filter((id) => !ids.includes(id) && !record.knownIds.includes(id))
  if (appeared.length === 0 && left.length === 0) return record
  const knownIds = [...record.knownIds, ...left]
  if (left.length > 0 && ids.every((id) => knownIds.includes(id))) return null
  return {
    ...record,
    knownIds,
    seenIds: [...record.seenIds.filter((id) => !left.includes(id)), ...appeared],
  }
}

/**
 * 알 수 없게 끝난 학부모 추가가 있는지와, 그 뒤로 학생을 다시 받았는지. 그 학생의 상세 화면이 쓴다.
 * 안내(`useGuardianAddedNotice`)와 달리 읽어도 지우지 않는다. 다시 받을 때까지, 그리고 닫을 때까지 봐야 한다.
 * 화면을 떠났다 돌아와도 남아 있다. 로그인·로그아웃할 때 다른 자료와 함께 지워진다.
 * - `checked`: 그 뒤로 학생을 다시 받았다. 지금 보이는 학부모가 서버의 것이다.
 *   아니면 지금 보이는 학부모는 시도하기 전의 것일 수 있다.
 * - `fetching`: 학생을 받는 중이다.
 */
export function useUnsureGuardianAdd(studentId: number) {
  const queryClient = useQueryClient()
  const key = useMemo(() => unsureAddKey(studentId), [studentId])
  // 요청은 없다. 캐시에 적어 둔 것을 구독해 읽기만 한다.
  const { data: stored = null } = useQuery<UnsureGuardianAdd | null>({
    queryKey: key,
    queryFn: skipToken,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  const detail = useStudent(studentId)
  const guardians = detail.data?.guardians
  // 기록을 받은 학생에 맞춘 값. 화면은 이것을 쓴다. 그리는 중에 계산해, 캐시에 옮겨 적기 전의 렌더에서도
  // 맞는 안내를 그린다(effect에서만 맞추면 학부모가 빠진 학생이 처음 그려질 때 "보이지 않아요"가 잠깐 뜬다).
  const unsure = useMemo(
    () => (stored && guardians ? reconcileUnsureAdd(stored, guardians) : stored),
    [stored, guardians],
  )

  // 맞춘 값을 캐시에 옮겨 적는다. 다음에 학생을 받을 때 이 기록을 기준으로 맞추고, acknowledge도 캐시를 본다.
  // 기록이 새로 생겼을 때도(stored) 다시 돈다. 받은 학생이 앞과 같으면 TanStack Query가 같은 자료를 그대로 두어
  // guardians만 보면 돌지 않는데, 그 사이 기록이 생겼다면 이미 보이던 학부모를 적어야 한다.
  // 그리고 이 effect가 돌기 전에 캐시가 바뀌었으면(안내 닫기 등) 그것을 덮지 않는다.
  useEffect(() => {
    if (unsure === stored) return
    queryClient.setQueryData<UnsureGuardianAdd | null>(key, (current) =>
      current === stored ? unsure : current,
    )
  }, [queryClient, key, stored, unsure])

  return {
    unsure,
    // 횟수가 아니라 시각으로 견준다. 기록은 화면을 떠나 있어도 남지만 받아 둔 학생은 5분 뒤 지워져,
    // 돌아왔을 때의 학생은 새로 만든 조회의 것이다. 시각은 그래도 견줄 수 있다.
    checked: unsure !== null && detail.dataUpdatedAt >= unsure.failedAt,
    fetching: detail.isFetching,
    recheck: () => void detail.refetch(),
    // 지우지 않고 비워 둔다. 구독 중인 화면이 바로 다시 그린다.
    dismiss: () => queryClient.setQueryData<UnsureGuardianAdd | null>(key, null),
    /**
     * 그 학부모는 이제 아는 학부모다(안내를 닫았거나, 연결을 끊었거나, 고쳤다). 더 알리지 않는다.
     * 놓친 추가로 붙은 학부모가 더 남아 있으면 그 안내는 그대로 둔다. 남지 않았으면 기록을 비운다.
     * 늦게 불려도 된다. 부를 때의 캐시를 본다.
     */
    acknowledge: (guardianId: number) => {
      const record = queryClient.getQueryData<UnsureGuardianAdd | null>(key)
      if (!record || record.knownIds.includes(guardianId)) return
      const knownIds = [...record.knownIds, guardianId]
      const guardians = queryClient.getQueryData<Student>(detailKey(studentId))?.guardians ?? []
      const next: UnsureGuardianAdd | null = guardians.some(({ id }) => !knownIds.includes(id))
        ? { ...record, knownIds }
        : null
      queryClient.setQueryData<UnsureGuardianAdd | null>(key, next)
    },
  }
}

// 등록 안내는 한 칸이다(목록 화면이 어느 학생의 안내든 읽는다).
const registeredNoticeKey = ['students', 'registered-notice'] as const
// 학부모 추가 안내는 학생마다 한 칸이다. 한 칸만 두면, 읽기 전에 다른 학생에게 학부모를 추가했을 때 앞의 안내가 덮인다.
const guardianAddedNoticePrefix = ['students', 'guardian-added-notice'] as const
const guardianAddedNoticeKey = (studentId: number) =>
  [...guardianAddedNoticePrefix, studentId] as const

type NoticeKey = typeof registeredNoticeKey | ReturnType<typeof guardianAddedNoticeKey>

/**
 * 화면이 읽어 갈 안내를 캐시에 남긴다. 요청을 보낸 화면이 사라진 뒤에도 남는다.
 * 보낸 사람이 그대로인지(userChanged)는 부르는 쪽이 먼저 확인한다.
 * 칸마다 하나만 남는다. 읽기 전에 같은 칸에 또 남기면 앞의 것은 덮인다.
 */
function leaveNotice(queryClient: QueryClient, key: NoticeKey, notice: { studentId: number }) {
  // 보는 화면이 없는 캐시는 기본 5분 뒤 지워진다. 화면이 읽을 때까지 남겨 둔다.
  queryClient.setQueryDefaults(registeredNoticeKey, { gcTime: Infinity })
  queryClient.setQueryDefaults(guardianAddedNoticePrefix, { gcTime: Infinity })
  queryClient.setQueryData(key, notice)
}

/**
 * 남겨 둔 안내를 한 번 보여준다. [안내, 닫기]를 돌려준다.
 * `studentId`를 주면 그 학생의 안내만 꺼낸다. 주지 않으면 어느 학생의 안내든 꺼낸다.
 * 이름(학생·학부모)과 가린 번호가 들어 있어 주소나 브라우저 기록에 두지 않고 캐시에 둔다.
 * 읽자마자 캐시에서 지우므로 다른 화면에 갔다 돌아오면 다시 뜨지 않는다.
 * 읽지 못한 안내도 로그인·로그아웃할 때 다른 자료와 함께 지워진다.
 * `key`는 렌더마다 같은 배열이어야 한다(바뀌면 구독을 다시 건다).
 */
function useLeftNotice<Notice extends { studentId: number }>(
  key: NoticeKey,
  studentId?: number,
): [Notice | undefined, () => void] {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState(() => {
    const left = queryClient.getQueryData<Notice>(key)
    return left && (studentId === undefined || left.studentId === studentId) ? left : undefined
  })

  // useEffect가 아니라 useLayoutEffect다. useEffect의 정리는 화면이 내려간 뒤 조금 늦게 실행된다.
  // 그 틈에 안내가 도착하면 사라진 화면의 구독이 받아 캐시에서 지워, 안내가 어디에도 보이지 않는다.
  // useLayoutEffect의 정리는 화면이 내려가는 순간에 실행된다.
  useLayoutEffect(() => {
    const hash = hashKey(key)
    // 남겨 둔 것을 화면에 옮겨 담고 지운다. 다른 학생의 안내는 그대로 둔다.
    const take = () => {
      const left = queryClient.getQueryData<Notice>(key)
      if (left === undefined || (studentId !== undefined && left.studentId !== studentId)) return
      setNotice(left)
      queryClient.removeQueries({ queryKey: key })
    }
    // 구독하기 전에 와 있던 것. 대개는 처음 그릴 때 읽은 것과 같아 다시 그리지 않는다.
    // 그 뒤에 도착한 것(처음 그린 때와 구독 사이, 화면이 잠깐 가려져 구독이 끊긴 사이)도 지우기만 하면 사라지므로 옮겨 담는다.
    take()
    // 화면이 떠 있는 동안 안내가 도착하는 경우(학부모 추가는 보통 이쪽이고, 등록은 응답 전에 목록으로 온 경우다). 바로 보여준다.
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.queryHash === hash) take()
    })
  }, [queryClient, key, studentId])

  return [notice, () => setNotice(undefined)]
}

/**
 * 등록 결과 안내를 한 번 보여준다. [안내, 닫기]를 돌려준다.
 * `studentId`를 주면 그 학생의 안내만 꺼낸다(상세 화면). 주지 않으면 어느 학생의 안내든 꺼낸다(목록 화면).
 * 응답을 기다리다 목록으로 먼저 온 경우, 화면이 떠 있는 동안 등록이 끝나면 그때 보여준다.
 */
export function useRegisteredNotice(
  studentId?: number,
): [RegisteredNotice | undefined, () => void] {
  return useLeftNotice<RegisteredNotice>(registeredNoticeKey, studentId)
}

/**
 * 학부모 추가 결과 안내를 한 번 보여준다. [안내, 닫기]를 돌려준다. 그 학생의 상세 화면이 쓴다.
 * 추가 창이 닫히거나 화면을 떠났다 돌아와도, 기존 학부모에 연결했다는 안내를 놓치지 않는다.
 * 그 학생의 상세를 다시 열 때까지(또는 로그아웃까지) 남으므로 한참 뒤에 보일 수 있다.
 */
export function useGuardianAddedNotice(
  studentId: number,
): [GuardianAddedNotice | undefined, () => void] {
  const key = useMemo(() => guardianAddedNoticeKey(studentId), [studentId])
  return useLeftNotice<GuardianAddedNotice>(key, studentId)
}
