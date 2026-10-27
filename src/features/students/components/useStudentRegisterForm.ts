import { useRef, useState } from 'react'
import {
  NO_SERVER_ERRORS,
  splitServerError,
  UNSURE_RESEND_AS_IS,
  type FieldErrors,
} from '@/shared/api'
import { useMe } from '@/shared/auth'
import { isMobilePhone, normalizeMobilePhone, todayInSeoul } from '@/shared/lib'
import { useRegisterStudent, type Student, type StudentCreateRequest } from '../api'
import { registeredAtError } from '../registeredAt'
import type { GuardianErrors, GuardianInput } from './GuardianFields'
import { MAX_GUARDIANS, PHONE_FORMAT_ERROR } from './guardianForm'
import type { StudentInput } from './StudentFields'
import { useLookups } from './useLookups'

const CONTACT_REQUIRED = '학부모나 학생 본인의 휴대전화 번호가 하나는 있어야 해요.'

// 학생 칸의 이름. 요청 본문의 필드 이름과 같아야 한다. guardians는 학부모 영역 전체다.
const STUDENT_FIELDS = [
  'name',
  'grade',
  'campusId',
  'classId',
  'school',
  'registeredAt',
  'phone',
  'guardians',
] as const satisfies readonly (keyof StudentCreateRequest)[]
type GuardianFieldName = `guardians[${number}].${keyof GuardianErrors}`
// 칸 이름을 타입으로 묶어 둔다. 오타가 나면 오류 문구가 어느 칸에도 보이지 않게 된다.
type Field = (typeof STUDENT_FIELDS)[number] | GuardianFieldName

// 필드 목록 없이 코드로만 오는 에러가 어느 칸의 문제인지.
const codeFields: Record<string, Field> = {
  MEMBER_INVALID_CAMPUS: 'campusId',
  MEMBER_INVALID_CLASS: 'classId',
  MEMBER_CONTACT_REQUIRED: 'guardians',
}

/** 서버가 알려 주는 학부모 칸의 이름. 요청 본문의 경로와 같다(`guardians[0].name`). */
export function guardianField(index: number, field: keyof GuardianErrors): GuardianFieldName {
  return `guardians[${index}].${field}`
}

/**
 * 본인 미리 확인(제이G패스 데스크)에 보낼 값. 폼의 학생 이름과 학부모 번호다.
 * 아직 보낼 수 없으면 그 까닭(`reason`)을 준다.
 */
export type HolderInput =
  { ready: true; studentName: string; guardianPhones: string[] } | { ready: false; reason: string }

/**
 * 학생 등록 폼의 상태·검사·등록. 학생 등록 화면과 데스크(제이G패스 신규 등록)가 같이 쓴다.
 * 칸은 `StudentFields`와 `GuardiansSection`으로 그린다. 감싸는 상자(Card 등)는 쓰는 쪽이 정한다.
 */
export function useStudentRegisterForm() {
  const { data: me } = useMe()
  const lookups = useLookups('등록')
  const register = useRegisterStudent()

  // 직원은 자기 지점을 미리 골라 둔다. 다른 지점 학생도 등록할 수 있으므로 바꿀 수 있다.
  const initialCampusId = me?.campusId ? String(me.campusId) : ''
  const [today] = useState(() => todayInSeoul())
  const [student, setStudent] = useState<StudentInput>({
    name: '',
    grade: '',
    campusId: initialCampusId,
    classId: '',
    school: '',
    registeredAt: today,
    phone: '',
  })
  const { name, grade, campusId, classId, school, registeredAt, phone } = student
  const nextKey = useRef(1)
  // 대부분 어머니 번호부터 넣는다. 한 줄을 미리 열어 둔다.
  const [guardians, setGuardians] = useState<GuardianInput[]>([
    { key: 0, relation: 'MOTHER', name: '', phone: '' },
  ])
  // 보내기 전에 걸러 낸 오류. 서버가 준 오류는 register.error에서 읽는다.
  const [localErrors, setLocalErrors] = useState<FieldErrors<Field>>({})

  const fieldNames: Field[] = [
    ...STUDENT_FIELDS,
    ...guardians.flatMap((_, index) =>
      (['relation', 'name', 'phone'] as const).map((field) => guardianField(index, field)),
    ),
  ]
  const server = register.isError
    ? splitServerError(register.error, {
        fields: fieldNames,
        codes: codeFields,
        unsure: UNSURE_RESEND_AS_IS,
      })
    : NO_SERVER_ERRORS
  const errors: FieldErrors<Field> = { ...server.fields, ...localErrors }

  const dirty =
    name !== '' ||
    grade !== '' ||
    campusId !== initialCampusId ||
    classId !== '' ||
    school !== '' ||
    registeredAt !== today ||
    phone !== '' ||
    guardians.length !== 1 ||
    guardians.some((guardian) => guardian.name !== '' || guardian.phone !== '')

  function changeGuardian(key: number, next: GuardianInput) {
    setGuardians((list) => list.map((guardian) => (guardian.key === key ? next : guardian)))
  }

  function addGuardian() {
    const key = nextKey.current
    nextKey.current += 1
    setGuardians((list) => [...list, { key, relation: 'FATHER', name: '', phone: '' }])
    // 학부모가 생겼으니 "연락처가 하나는 있어야 해요"는 맞지 않는다.
    setLocalErrors((current) => ({ ...current, guardians: undefined }))
  }

  function removeGuardian(key: number) {
    setGuardians((list) => list.filter((guardian) => guardian.key !== key))
    // 줄 번호가 당겨지므로, 번호로 붙여 둔 오류는 다른 학부모의 칸에 붙게 된다. 지우고 다음 제출 때 다시 확인한다.
    setLocalErrors({})
    register.reset()
  }

  /** 보내기 전에 화면에서 확인할 수 있는 것을 확인한다. 나머지 규칙은 서버가 판단한다. */
  function validate(): FieldErrors<Field> {
    const next: FieldErrors<Field> = {}
    if (name.trim() === '') next.name = '이름을 입력해 주세요.'
    if (grade === '') next.grade = '학년을 골라 주세요.'
    if (campusId === '') next.campusId = '지점을 골라 주세요.'
    const dateError = registeredAtError(registeredAt)
    if (dateError) next.registeredAt = dateError
    // 서버도 형식이 틀린 칸을 짚어 거부하지만 한 번에 한 칸만 알려 준다. 보내기 전에 여기서 모든 칸을 확인한다.
    // 보낼 값(앞뒤 공백을 뗀 값)으로 확인한다. 복사해 붙인 번호 끝에 보이지 않는 공백이 붙어 오기도 한다.
    if (phone.trim() !== '' && !isMobilePhone(phone.trim())) next.phone = PHONE_FORMAT_ERROR

    const seen = new Set<string>()
    guardians.forEach((guardian, index) => {
      if (guardian.name.trim() === '') {
        next[guardianField(index, 'name')] = '이름을 입력해 주세요.'
      }
      const normalized = normalizeMobilePhone(guardian.phone.trim())
      if (guardian.phone.trim() === '') {
        next[guardianField(index, 'phone')] = '휴대전화 번호를 입력해 주세요.'
      } else if (normalized === null) {
        next[guardianField(index, 'phone')] = PHONE_FORMAT_ERROR
      } else if (seen.has(normalized)) {
        next[guardianField(index, 'phone')] = '위 학부모와 같은 번호예요.'
      } else {
        seen.add(normalized)
      }
    })

    if (guardians.length === 0 && phone.trim() === '') next.guardians = CONTACT_REQUIRED
    return next
  }

  /**
   * 검사하고 등록한다. 검사에 걸리면 칸 아래에 알리고 보내지 않는다.
   * 등록 결과 안내는 useRegisterStudent가 남기고 학생 상세 화면이 보여준다.
   */
  function submit(onRegistered: (created: Student) => void) {
    if (!lookups.ready) return
    const nextErrors = validate()
    setLocalErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || grade === '') {
      // 보내지 않았으니 지난번 서버 오류는 지금 입력에 대한 것이 아니다.
      register.reset()
      return
    }

    const body: StudentCreateRequest = {
      campusId: Number(campusId),
      classId: classId === '' ? undefined : Number(classId),
      name: name.trim(),
      school: school.trim() === '' ? undefined : school.trim(),
      grade,
      registeredAt,
      phone: phone.trim() === '' ? undefined : phone.trim(),
      guardians: guardians.map((guardian) => ({
        relation: guardian.relation,
        name: guardian.name.trim(),
        phone: guardian.phone.trim(),
      })),
    }
    register.mutate(body, { onSuccess: onRegistered })
  }

  return {
    student,
    setStudent,
    guardians,
    changeGuardian,
    addGuardian,
    removeGuardian,
    errors,
    /** 칸에 붙지 않는 서버 오류(폼 아래 안내)와 그 요청 번호 */
    server,
    lookups,
    saving: register.isPending,
    dirty,
    submit,
    holderInput: holderInputOf(student, guardians),
  }
}

export type StudentRegisterForm = ReturnType<typeof useStudentRegisterForm>

function holderInputOf(student: StudentInput, guardians: GuardianInput[]): HolderInput {
  const studentName = student.name.trim()
  if (studentName === '') return { ready: false, reason: '학생 이름을 적어 주세요.' }
  const phones = guardians.map((guardian) => normalizeMobilePhone(guardian.phone.trim()))
  if (guardians.every((guardian) => guardian.phone.trim() === '')) {
    return { ready: false, reason: '학부모 휴대전화 번호를 적어 주세요.' }
  }
  // 하나라도 비었거나 형식이 틀리면 보내지 않는다. 등록할 번호와 확인한 번호가 같아야 한다.
  if (phones.some((value) => value === null)) {
    return { ready: false, reason: '학부모 휴대전화 번호를 모두 맞게 적어 주세요.' }
  }
  const guardianPhones = phones as string[]
  // 등록도 같은 번호를 거부한다("위 학부모와 같은 번호예요."). 확인만 통과하고 등록에서 막히지 않게 여기서도 막는다.
  if (new Set(guardianPhones).size !== guardianPhones.length) {
    return { ready: false, reason: '같은 학부모 번호가 두 번 적혀 있어요.' }
  }
  return { ready: true, studentName, guardianPhones: guardianPhones.slice(0, MAX_GUARDIANS) }
}
