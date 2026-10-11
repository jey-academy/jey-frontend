import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { splitServerError, type FieldErrors } from '@/shared/api'
import { isMobilePhone } from '@/shared/lib'
import { Button, Card, Modal, Notice } from '@/shared/ui'
import { useUpdateStudent, type Student, type StudentUpdateRequest } from '../api'
import { StudentFields, type StudentInput } from '../components/StudentFields'
import { StudentLoader } from '../components/StudentLoader'
import { useLookups } from '../components/useLookups'
import type { Status } from '../labels'
import { studentPath } from '../paths'

const FIELDS = [
  'name',
  'grade',
  'campusId',
  'classId',
  'school',
  'registeredAt',
  'phone',
  'status',
] as const
type Field = (typeof FIELDS)[number]

// 필드 목록 없이 코드로만 오는 에러가 어느 칸의 문제인지.
const codeFields: Record<string, Field> = {
  MEMBER_INVALID_CAMPUS: 'campusId',
  MEMBER_INVALID_CLASS: 'classId',
}

/** 학생 정보 수정. 학부모는 여기서 고치지 않는다. */
export function StudentEditPage() {
  return (
    <StudentLoader>
      {/* 폼은 처음 받은 값으로 시작한다. 고치는 동안 다시 받은 값이 입력을 덮어쓰지 않는다. */}
      {(student) => <StudentEditForm key={student.id} student={student} />}
    </StudentLoader>
  )
}

function StudentEditForm({ student }: { student: Student }) {
  const navigate = useNavigate()
  const lookups = useLookups()
  const update = useUpdateStudent(student.id)
  const detailPath = studentPath(student.id)

  const [initial] = useState<StudentInput>(() => ({
    name: student.name,
    grade: student.grade,
    campusId: String(student.campusId),
    classId: student.classId === null ? '' : String(student.classId),
    school: student.school ?? '',
    registeredAt: student.registeredAt,
    // 번호 칸은 비워 둔다. 서버가 준 번호는 가운데가 가려져 있어 다시 보내면 거부된다.
    phone: '',
  }))
  const [input, setInput] = useState(initial)
  const [status, setStatus] = useState<Status>(student.status)
  // 보내기 전에 걸러 낸 오류. 서버가 준 오류는 update.error에서 읽는다.
  const [localErrors, setLocalErrors] = useState<FieldErrors<Field>>({})
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const saving = update.isPending
  const server = update.isError
    ? splitServerError(update.error, { fields: FIELDS, codes: codeFields })
    : { fields: {}, form: null }
  const errors: FieldErrors<Field> = { ...server.fields, ...localErrors }

  const dirty =
    status !== student.status ||
    (Object.keys(initial) as (keyof StudentInput)[]).some((key) => input[key] !== initial[key])

  function validate(): FieldErrors<Field> {
    const next: FieldErrors<Field> = {}
    if (input.name.trim() === '') next.name = '이름을 입력해 주세요.'
    if (input.grade === '') next.grade = '학년을 골라 주세요.'
    if (input.campusId === '') next.campusId = '지점을 골라 주세요.'
    if (input.registeredAt === '') next.registeredAt = '등록일을 골라 주세요.'
    // 전화번호 형식은 서버가 어느 칸이 틀렸는지 알려 주지 않는다. 보낼 값(앞뒤 공백을 뗀 값)으로 여기서 확인한다.
    if (input.phone.trim() !== '' && !isMobilePhone(input.phone.trim())) {
      next.phone = '휴대전화 번호 형식이 아니에요. 예: 010-1234-5678'
    }
    return next
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!lookups.ready) return
    const nextErrors = validate()
    setLocalErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || input.grade === '') {
      // 보내지 않았으니 지난번 서버 오류는 지금 입력에 대한 것이 아니다.
      update.reset()
      return
    }

    const body: StudentUpdateRequest = {
      campusId: Number(input.campusId),
      // 반과 학교는 보내지 않으면 비워진다. 지금 값을 그대로 실어 보낸다.
      classId: input.classId === '' ? undefined : Number(input.classId),
      name: input.name.trim(),
      school: input.school.trim() === '' ? undefined : input.school.trim(),
      grade: input.grade,
      registeredAt: input.registeredAt,
      status,
      // 새로 입력했을 때만 보낸다. 보내지 않으면 서버는 번호를 그대로 둔다.
      phone: input.phone.trim() === '' ? undefined : input.phone.trim(),
    }
    update.mutate(body, { onSuccess: () => navigate(detailPath) })
  }

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">학생 정보 수정</h1>
      <p className="mt-1 text-sub">{`${student.name} 학생의 정보를 고쳐요. 학부모는 상세 화면에서 봐요.`}</p>

      <form onSubmit={handleSubmit} noValidate className="mt-7 grid max-w-[860px] gap-5">
        <Card>
          <StudentFields
            value={input}
            onChange={setInput}
            errors={errors}
            campuses={lookups.campuses}
            classes={lookups.classes}
            phoneHint={
              student.phone === null
                ? '없으면 비워 두세요.'
                : `바꿀 때만 입력하세요. 지금 번호: ${student.phone}`
            }
            status={status}
            onStatusChange={setStatus}
            // 반 목록을 받은 뒤에만 판단한다. 받기 전에는 모든 반이 목록에 없는 반으로 보인다.
            currentClass={
              lookups.ready && student.classId !== null
                ? { id: student.classId, campusId: student.campusId }
                : undefined
            }
            disabled={saving}
          />
        </Card>

        {server.form && <Notice>{server.form}</Notice>}
        {lookups.errorNotice}

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => (dirty ? setConfirmingCancel(true) : navigate(detailPath))}
            disabled={saving}
          >
            취소
          </Button>
          <Button type="submit" disabled={saving || !lookups.ready}>
            {saving ? '저장하는 중' : '저장'}
          </Button>
        </div>
      </form>

      <Modal
        open={confirmingCancel}
        onClose={() => setConfirmingCancel(false)}
        title="고친 내용을 버릴까요?"
        description="저장하지 않고 나가면 고친 내용이 사라져요."
      >
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setConfirmingCancel(false)}>
            계속 고치기
          </Button>
          <Button onClick={() => navigate(detailPath)}>버리고 나가기</Button>
        </div>
      </Modal>
    </>
  )
}
