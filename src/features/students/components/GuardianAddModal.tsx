import { useState, type FormEvent } from 'react'
import {
  splitServerError,
  UNSURE_RESEND_AS_IS,
  type FieldErrors,
  NO_SERVER_ERRORS,
} from '@/shared/api'
import { isMobilePhone } from '@/shared/lib'
import { Button, Modal, Notice, SelectField, TextField } from '@/shared/ui'
import { useAddGuardian, type Guardian, type Student } from '../api'
import { relationOptions, type Relation } from '../labels'
import { PHONE_FORMAT_ERROR } from './guardianForm'

/** 추가한 결과. `linked`가 있으면 새로 만들지 않고 이미 있던 학부모에 연결한 것이다. */
export type GuardianAdded = {
  /** 입력한 이름 */
  name: string
  /** 이미 있던 학부모. 이름은 입력한 것이 아니라 저장돼 있던 것이다. */
  linked?: Guardian
}

type GuardianAddModalProps = {
  open: boolean
  onClose: () => void
  student: Student
  /** 추가에 성공했을 때. 창을 닫기 직전에 부른다. */
  onAdded: (added: GuardianAdded) => void
}

/** 학부모 추가 창. 닫히면 안의 폼이 사라지므로, 다시 열 때마다 입력값이 처음 상태로 돌아간다. */
export function GuardianAddModal({ open, onClose, student, onAdded }: GuardianAddModalProps) {
  // 저장하는 동안의 닫기 요청은 받지 않는다. 닫아도 요청은 끝까지 가고, 실패했을 때 안내를 볼 곳이 없어진다.
  const [saving, setSaving] = useState(false)

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose()
      }}
      title="학부모 추가"
      description={`${student.name} 학생의 학부모를 추가해요.`}
      // 입력하던 내용이 실수로 사라지지 않게 배경을 눌러도 닫지 않는다.
      closeOnBackdrop={false}
      className="max-w-[460px]"
    >
      <GuardianAddForm
        student={student}
        onClose={onClose}
        onAdded={onAdded}
        saving={saving}
        onSavingChange={setSaving}
      />
    </Modal>
  )
}

type Field = 'relation' | 'name' | 'phone'
const fieldNames: Field[] = ['relation', 'name', 'phone']
// 번호가 같은 학부모가 이미 이 학생에게 연결돼 있다. 필드 목록 없이 코드로만 온다.
const codeFields = { MEMBER_GUARDIAN_ALREADY_LINKED: 'phone' } as const

type GuardianAddFormProps = Omit<GuardianAddModalProps, 'open'> & {
  saving: boolean
  onSavingChange: (saving: boolean) => void
}

function GuardianAddForm({
  student,
  onClose,
  onAdded,
  saving,
  onSavingChange,
}: GuardianAddFormProps) {
  const add = useAddGuardian(student.id)
  // 가장 흔한 다음 입력을 골라 둔다(어머니가 있으면 아버지).
  const [relation, setRelation] = useState<Relation>(() =>
    student.guardians.some((guardian) => guardian.relation === 'MOTHER') ? 'FATHER' : 'MOTHER',
  )
  const [name, setName] = useState('')
  // 입력한 휴대전화 번호 원문. 화면과 요청 본문 밖으로 내보내지 않는다.
  const [phone, setPhone] = useState('')
  // 보내기 전에 걸러 낸 오류. 서버가 준 오류는 add.error에서 읽는다.
  const [localErrors, setLocalErrors] = useState<FieldErrors<Field>>({})

  const server = add.isError
    ? splitServerError(add.error, {
        fields: fieldNames,
        codes: codeFields,
        unsure: UNSURE_RESEND_AS_IS,
      })
    : NO_SERVER_ERRORS
  const errors: FieldErrors<Field> = { ...server.fields, ...localErrors }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: FieldErrors<Field> = {}
    if (name.trim() === '') nextErrors.name = '이름을 입력해 주세요.'
    // 전화번호 형식이 틀리면 서버는 어느 칸인지 알려 주지 않는다. 보낼 값(앞뒤 공백을 뗀 값)으로 여기서 확인한다.
    if (phone.trim() === '') nextErrors.phone = '휴대전화 번호를 입력해 주세요.'
    else if (!isMobilePhone(phone.trim())) nextErrors.phone = PHONE_FORMAT_ERROR
    setLocalErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      // 보내지 않았으니 지난번 서버 오류는 지금 입력에 대한 것이 아니다.
      add.reset()
      return
    }

    onSavingChange(true)
    add.mutate(
      { relation, name: name.trim(), phone: phone.trim() },
      {
        onSuccess: (saved) => {
          // linkedToExisting은 방금 붙인 학부모에게만 true로 온다.
          onAdded({
            name: name.trim(),
            linked: saved.guardians.find((guardian) => guardian.linkedToExisting),
          })
          onClose()
        },
        onSettled: () => onSavingChange(false),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-5 grid gap-4 text-left">
      <SelectField
        label="관계"
        name="relation"
        value={relation}
        onChange={(event) => setRelation(event.target.value as Relation)}
        error={errors.relation}
      >
        {relationOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
      <TextField
        label="이름"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={50}
        autoComplete="off"
        error={errors.name}
      />
      <TextField
        label="휴대전화"
        name="phone"
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        autoComplete="off"
        placeholder="010-1234-5678"
        hint="이미 등록된 번호면 새로 만들지 않고 그 학부모에 연결해요."
        error={errors.phone}
      />
      {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          취소
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? '추가하는 중' : '추가'}
        </Button>
      </div>
    </form>
  )
}
