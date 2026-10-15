import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { splitServerError, type FieldErrors, NO_SERVER_ERRORS } from '@/shared/api'
import { isMobilePhone } from '@/shared/lib'
import { Button, Card, Form, Modal, Notice, useIsShown } from '@/shared/ui'
import { useUpdateStudent, type Student, type StudentUpdateRequest } from '../api'
import { PHONE_FORMAT_ERROR } from '../components/guardianForm'
import { StudentFields, type StudentInput } from '../components/StudentFields'
import { StudentLoader } from '../components/StudentLoader'
import { useLookups } from '../components/useLookups'
import type { Status } from '../labels'
import { studentPath } from '@/shared/paths'
import { registeredAtError } from '../registeredAt'

// 요청 본문의 필드 이름과 같아야 한다. 다르면 서버가 짚은 칸의 오류가 칸 옆에 보이지 않는다.
const FIELDS = [
  'name',
  'grade',
  'campusId',
  'classId',
  'school',
  'registeredAt',
  'phone',
  'status',
] as const satisfies readonly (keyof StudentUpdateRequest)[]
type Field = (typeof FIELDS)[number]

// 필드 목록 없이 코드로만 오는 에러가 어느 칸의 문제인지.
const codeFields: Record<string, Field> = {
  MEMBER_INVALID_CAMPUS: 'campusId',
  MEMBER_INVALID_CLASS: 'classId',
}

/** 학생 정보 수정. 학부모는 여기서 고치지 않는다. */
export function StudentEditPage() {
  return (
    // 새로 받은 학생으로 폼을 채운다. 저장은 값을 통째로 바꾸므로 오래된 값으로 시작하면 안 된다.
    <StudentLoader fresh>
      {(student, { refetchFailed, refetchRequestId }) => (
        <StudentEditForm
          key={student.id}
          student={student}
          outdated={refetchFailed}
          outdatedRequestId={refetchRequestId}
        />
      )}
    </StudentLoader>
  )
}

type StudentEditFormProps = {
  student: Student
  /** 새로 받지 못해 받아 둔 값으로 채웠는지 */
  outdated: boolean
  /** `outdated` 안내 아래에 보여줄 요청 번호 */
  outdatedRequestId: string | null
}

function StudentEditForm({ student, outdated, outdatedRequestId }: StudentEditFormProps) {
  const navigate = useNavigate()
  const isShown = useIsShown()
  const lookups = useLookups('저장')
  const update = useUpdateStudent(student.id)
  const detailPath = studentPath(student.id)

  // 폼이 처음 뜰 때의 학생. 고치는 동안 다시 받은 값이 입력이나 비교 기준을 바꾸지 않게 이것만 본다.
  const [base] = useState(student)
  const [initial] = useState<StudentInput>(() => ({
    name: base.name,
    grade: base.grade,
    campusId: String(base.campusId),
    classId: base.classId === null ? '' : String(base.classId),
    school: base.school ?? '',
    registeredAt: base.registeredAt,
    // 번호 칸은 비워 둔다. 서버가 준 번호는 가운데가 가려져 있어 다시 보내면 거부된다.
    phone: '',
  }))
  const [input, setInput] = useState(initial)
  const [status, setStatus] = useState<Status>(base.status)
  // 보내기 전에 걸러 낸 오류. 서버가 준 오류는 update.error에서 읽는다.
  const [localErrors, setLocalErrors] = useState<FieldErrors<Field>>({})
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const saving = update.isPending
  const server = update.isError
    ? splitServerError(update.error, {
        fields: FIELDS,
        codes: codeFields,
        // 수정은 같은 값을 다시 보내도 결과가 같다. 등록처럼 목록을 확인하게 하지 않는다.
        unsure: '저장됐는지 확인하지 못했어요. 그대로 다시 저장해도 돼요.',
      })
    : NO_SERVER_ERRORS
  const errors: FieldErrors<Field> = { ...server.fields, ...localErrors }

  const dirty =
    status !== base.status ||
    (Object.keys(initial) as (keyof StudentInput)[]).some((key) => input[key] !== initial[key])

  function validate(): FieldErrors<Field> {
    const next: FieldErrors<Field> = {}
    if (input.name.trim() === '') next.name = '이름을 입력해 주세요.'
    if (input.grade === '') next.grade = '학년을 골라 주세요.'
    if (input.campusId === '') next.campusId = '지점을 골라 주세요.'
    const dateError = registeredAtError(input.registeredAt)
    if (dateError) next.registeredAt = dateError
    // 서버도 형식이 틀린 칸을 짚어 거부하지만 한 번에 한 칸만 알려 준다. 보낼 값(앞뒤 공백을 뗀 값)으로 여기서 먼저 확인한다.
    if (input.phone.trim() !== '' && !isMobilePhone(input.phone.trim())) {
      next.phone = PHONE_FORMAT_ERROR
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
      // 반과 학교는 보내지 않으면 비워진다. 입력칸의 값을 항상 실어 보낸다.
      classId: input.classId === '' ? undefined : Number(input.classId),
      name: input.name.trim(),
      school: input.school.trim() === '' ? undefined : input.school.trim(),
      grade: input.grade,
      registeredAt: input.registeredAt,
      status,
      // 새로 입력했을 때만 보낸다. 보내지 않으면 서버는 번호를 그대로 둔다.
      phone: input.phone.trim() === '' ? undefined : input.phone.trim(),
    }
    // 응답을 기다리다 다른 화면으로 떠났으면 상세로 끌고 가지 않는다(useIsShown).
    update.mutate(body, {
      onSuccess: () => {
        if (isShown()) navigate(detailPath)
      },
    })
  }

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">학생 정보 수정</h1>
      <p className="mt-1 text-sub">{`${base.name} 학생의 정보를 고쳐요. 학부모는 상세 화면에서 봐요.`}</p>

      <Form saving={saving} onSubmit={handleSubmit} className="mt-7 grid max-w-[860px] gap-5">
        {outdated && (
          <Notice requestId={outdatedRequestId}>
            최신 내용을 확인하지 못했어요. 아래는 이전 내용일 수 있고, 저장하면 이 내용으로
            바뀌어요.
          </Notice>
        )}

        <Card>
          <StudentFields
            value={input}
            onChange={setInput}
            errors={errors}
            campuses={lookups.campuses}
            classes={lookups.classes}
            phoneHint={
              base.phone === null
                ? '없으면 비워 두세요.'
                : `바꿀 때만 입력하세요. 지금 번호: ${base.phone}`
            }
            status={{ value: status, onChange: setStatus }}
            // 반 목록을 받은 뒤에만 판단한다. 받기 전에는 모든 반이 목록에 없는 반으로 보인다.
            currentClass={
              lookups.ready && base.classId !== null
                ? { id: base.classId, campusId: base.campusId }
                : undefined
            }
          />
        </Card>

        {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}
        {lookups.errorNotice}

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => (dirty ? setConfirmingCancel(true) : navigate(detailPath))}
          >
            취소
          </Button>
          <Button type="submit" disabled={!lookups.ready}>
            {saving ? '저장하는 중' : '저장'}
          </Button>
        </div>
      </Form>

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
