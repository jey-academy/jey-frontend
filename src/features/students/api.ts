import {
  hashKey,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useLayoutEffect, useMemo, useState } from 'react'
import { api, ApiError, useIdempotentPost } from '@/shared/api'
import { meQueryKey, type Me } from '@/shared/auth'
import type { components } from '@/shared/api/schema'
import type { Relation } from './labels'

/** 목록의 한 줄. 학부모 전체가 아니라 대표 연락처만 있다. 전화번호는 서버가 가운데를 가려서 준다. */
export type StudentSummary = components['schemas']['StudentSummaryResponse']
export type StudentPage = components['schemas']['StudentPageResponse']
/** 학생 한 명의 전체 정보. 전화번호는 모두 서버가 가운데를 가려서 준다. */
export type Student = components['schemas']['StudentResponse']
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

// 학부모를 고친 응답(학생)을 그 학생의 상세에 넣는다.
async function storeStudent(
  queryClient: QueryClient,
  student: Student,
  sentBy: number | undefined,
) {
  // 저장 전에 보낸 조회가 늦게 도착해 고치기 전 값으로 덮어쓰지 못하게 한다.
  await queryClient.cancelQueries({ queryKey: detailKey(student.id) })
  if (userChanged(queryClient, sentBy)) {
    // 응답을 넣지 않았으니 받아 둔 상세는 고치기 전 값이다. 다시 받게 한다.
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
 */
export function useAddGuardian(studentId: number) {
  const queryClient = useQueryClient()
  const add = useIdempotentPost<GuardianRequest, Student>(`/api/v1/students/${studentId}/guardians`)
  return useMutation({
    mutationFn: add,
    onMutate: () => ({ userId: currentUserId(queryClient) }),
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
    },
    // 응답을 받지 못한 실패라면 서버에는 추가됐을 수 있다. 상세를 다시 받는다.
    onError: () => void queryClient.invalidateQueries({ queryKey: detailKey(studentId) }),
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
    onSuccess: (student, _body, context) => storeStudent(queryClient, student, context.userId),
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
    onSuccess: async (_data, guardianId) => {
      await queryClient.cancelQueries({ queryKey: detailKey(studentId) })
      queryClient.setQueryData<Student>(detailKey(studentId), (student) =>
        student
          ? { ...student, guardians: student.guardians.filter(({ id }) => id !== guardianId) }
          : student,
      )
    },
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
