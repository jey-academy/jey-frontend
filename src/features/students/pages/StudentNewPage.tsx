import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { splitServerError, type FieldErrors } from '@/shared/api'
import { useMe } from '@/shared/auth'
import { isMobilePhone, normalizeMobilePhone, todayInSeoul } from '@/shared/lib'
import { Button, Card, Modal, Notice } from '@/shared/ui'
import { useRegisterStudent, type StudentCreateRequest } from '../api'
import {
  GuardianFields,
  type GuardianErrors,
  type GuardianInput,
} from '../components/GuardianFields'
import { StudentFields, type StudentInput } from '../components/StudentFields'
import { useLookups } from '../components/useLookups'
import { studentPath, STUDENTS_PATH } from '../paths'

// 서버가 한 번에 받는 학부모 수
const MAX_GUARDIANS = 4

const PHONE_FORMAT_ERROR = '휴대전화 번호 형식이 아니에요. 예: 010-1234-5678'
const CONTACT_REQUIRED = '학부모나 학생 본인의 휴대전화 번호가 하나는 있어야 해요.'

// 학생 칸의 이름. guardians는 학부모 영역 전체다.
const STUDENT_FIELDS = [
  'name',
  'grade',
  'campusId',
  'classId',
  'school',
  'registeredAt',
  'phone',
  'guardians',
] as const
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
function guardianField(index: number, field: keyof GuardianErrors): GuardianFieldName {
  return `guardians[${index}].${field}`
}

/** 학생 등록. 학생과 학부모 연락처를 한 번에 등록한다. */
export function StudentNewPage() {
  const navigate = useNavigate()
  const { data: me } = useMe()
  const lookups = useLookups()
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
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const saving = register.isPending

  const fieldNames: Field[] = [
    ...STUDENT_FIELDS,
    ...guardians.flatMap((_, index) =>
      (['relation', 'name', 'phone'] as const).map((field) => guardianField(index, field)),
    ),
  ]
  const server = register.isError
    ? splitServerError(register.error, { fields: fieldNames, codes: codeFields })
    : { fields: {}, form: null }
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
    if (registeredAt === '') next.registeredAt = '등록일을 골라 주세요.'
    // 전화번호 형식은 서버가 어느 칸이 틀렸는지 알려 주지 않는다. 칸별로 여기서 확인한다.
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
    // 등록 결과 안내는 useRegisterStudent가 남기고 상세 화면이 보여준다.
    register.mutate(body, { onSuccess: (created) => navigate(studentPath(created.id)) })
  }

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">학생 등록</h1>
      <p className="mt-1 text-sub">학생과 학부모 연락처를 함께 등록해요.</p>

      <form onSubmit={handleSubmit} noValidate className="mt-7 grid max-w-[860px] gap-5">
        <Card>
          <StudentFields
            value={student}
            onChange={setStudent}
            errors={errors}
            campuses={lookups.campuses}
            classes={lookups.classes}
            phoneHint="없으면 비워 두세요."
            disabled={saving}
          />
        </Card>

        <Card>
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-[18px] font-bold text-ink">학부모</h2>
            <p className="text-[14px] text-sub">{`최대 ${MAX_GUARDIANS}명`}</p>
          </div>
          <div className="grid gap-4">
            {guardians.map((guardian, index) => (
              <GuardianFields
                key={guardian.key}
                order={index + 1}
                value={guardian}
                errors={{
                  relation: errors[guardianField(index, 'relation')],
                  name: errors[guardianField(index, 'name')],
                  phone: errors[guardianField(index, 'phone')],
                }}
                onChange={(next) => changeGuardian(guardian.key, next)}
                onRemove={() => removeGuardian(guardian.key)}
                disabled={saving}
              />
            ))}
          </div>
          {guardians.length === 0 && (
            <p className="text-sub">학부모 없이 등록하려면 학생 휴대전화가 있어야 해요.</p>
          )}
          {errors.guardians && <Notice className="mt-4">{errors.guardians}</Notice>}
          {guardians.length < MAX_GUARDIANS && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={addGuardian}
              disabled={saving}
            >
              학부모 추가
            </Button>
          )}
        </Card>

        {server.form && <Notice>{server.form}</Notice>}

        {lookups.errorNotice}

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => (dirty ? setConfirmingCancel(true) : navigate(STUDENTS_PATH))}
            disabled={saving}
          >
            취소
          </Button>
          <Button type="submit" disabled={saving || !lookups.ready}>
            {saving ? '등록하는 중' : '등록'}
          </Button>
        </div>
      </form>

      <Modal
        open={confirmingCancel}
        onClose={() => setConfirmingCancel(false)}
        title="입력한 내용을 지울까요?"
        description="등록하지 않고 나가면 입력한 내용이 사라져요."
      >
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setConfirmingCancel(false)}>
            계속 입력
          </Button>
          <Button onClick={() => navigate(STUDENTS_PATH)}>지우고 나가기</Button>
        </div>
      </Modal>
    </>
  )
}
