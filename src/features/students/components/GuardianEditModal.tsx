import { useState, type FormEvent } from 'react'
import {
  ApiError,
  isOutcomeUnknown,
  splitServerError,
  type FieldErrors,
  type ServerErrors,
  NO_SERVER_ERRORS,
} from '@/shared/api'
import { isMobilePhone } from '@/shared/lib'
import { Button, Modal, Notice, SelectField, TextField } from '@/shared/ui'
import { useChangeGuardianRelation, useUpdateGuardian, type Guardian } from '../api'
import { relationOptions, type Relation } from '../labels'
import { PHONE_FORMAT_ERROR } from './guardianForm'

type GuardianEditModalProps = {
  onClose: () => void
  studentId: number
  /** 고칠 학부모. 없으면 창이 닫힌다. */
  guardian: Guardian | undefined
  /** 모두 저장했을 때. 창을 닫기 직전에 부른다. */
  onSaved: () => void
}

/** 학부모 수정 창. 관계(이 학생에게만)와 이름·번호(형제에게도 반영)를 한 창에서 고친다. */
export function GuardianEditModal({
  onClose,
  studentId,
  guardian,
  onSaved,
}: GuardianEditModalProps) {
  // 저장하는 동안의 닫기 요청은 받지 않는다. 닫아도 요청은 끝까지 가고, 실패했을 때 안내를 볼 곳이 없어진다.
  const [saving, setSaving] = useState(false)

  return (
    <Modal
      open={guardian !== undefined}
      onClose={() => {
        if (!saving) onClose()
      }}
      title="학부모 수정"
      // 입력하던 내용이 실수로 사라지지 않게 배경을 눌러도 닫지 않는다.
      closeOnBackdrop={false}
      className="max-w-[460px]"
    >
      {guardian && (
        <GuardianEditForm
          // 대상이 바뀌면 폼을 새로 만든다. 앞의 학부모에 쓰던 값이 남지 않게 한다.
          key={guardian.id}
          studentId={studentId}
          guardian={guardian}
          onClose={onClose}
          onSaved={onSaved}
          saving={saving}
          onSavingChange={setSaving}
        />
      )}
    </Modal>
  )
}

type Field = 'relation' | 'name' | 'phone'
// 수정은 같은 값을 다시 보내도 결과가 같다.
const UNSURE = '저장됐는지 확인하지 못했어요. 그대로 다시 저장해도 돼요.'
const GONE = '이미 연결이 끊겼거나 없는 학부모예요.'

// 창이 고치는 것은 둘이고 요청도 둘이다. 요청마다 자기 칸의 오류만 받는다.
function serverErrors<Name extends Field>(
  error: unknown,
  fields: readonly Name[],
  codes: Record<string, NoInfer<Name>> = {},
): ServerErrors<Name> {
  if (error === null) return NO_SERVER_ERRORS
  if (error instanceof ApiError && error.code === 'MEMBER_GUARDIAN_NOT_FOUND') {
    return { ...NO_SERVER_ERRORS, form: GONE }
  }
  return splitServerError(error, { fields, codes, unsure: UNSURE })
}

type GuardianEditFormProps = {
  onClose: () => void
  studentId: number
  guardian: Guardian
  onSaved: () => void
  saving: boolean
  onSavingChange: (saving: boolean) => void
}

function GuardianEditForm({
  onClose,
  studentId,
  guardian,
  onSaved,
  saving,
  onSavingChange,
}: GuardianEditFormProps) {
  const changeRelation = useChangeGuardianRelation(studentId)
  const update = useUpdateGuardian()

  const [relation, setRelation] = useState<Relation>(guardian.relation)
  const [name, setName] = useState(guardian.name)
  // 새 번호 원문. 받은 번호는 가려져 있어 다시 보낼 수 없으므로 비워 두고, 입력했을 때만 보낸다.
  const [phone, setPhone] = useState('')
  const [localErrors, setLocalErrors] = useState<FieldErrors<Field>>({})
  // 이번 저장에서 관계는 저장됐는데 이름·번호가 남았는지.
  const [relationSaved, setRelationSaved] = useState(false)

  // 관계를 저장하면 받은 응답으로 guardian이 바뀐다. 그 뒤로는 관계가 바뀐 것으로 보지 않아 다시 보내지 않는다.
  const relationChanged = relation !== guardian.relation
  const profileChanged = name.trim() !== guardian.name || phone.trim() !== ''

  const relationServer = serverErrors(changeRelation.error, ['relation'])
  const profileServer = serverErrors(update.error, ['name', 'phone'], {
    MEMBER_GUARDIAN_PHONE_DUPLICATED: 'phone',
  })
  const phoneTaken =
    update.error instanceof ApiError && update.error.code === 'MEMBER_GUARDIAN_PHONE_DUPLICATED'
  const errors: FieldErrors<Field> = {
    ...relationServer.fields,
    ...profileServer.fields,
    // 번호를 합칠 수는 없다. 그 번호의 학부모를 쓰는 방법을 알려 준다.
    ...(phoneTaken && profileServer.fields.phone
      ? {
          phone: `${profileServer.fields.phone} 그 학부모로 바꾸려면 그 번호로 학부모를 추가한 뒤 이 학부모의 연결을 끊어 주세요.`,
        }
      : {}),
    ...localErrors,
  }
  // 관계 요청이 실패하면 이름·번호 요청은 나가지 않으므로, 폼 전체 문구는 둘 중 한쪽에만 있다.
  // 문구와 요청 번호가 서로 다른 요청의 것이 되지 않게 결과를 통째로 고른다.
  const formServer = relationServer.form ? relationServer : profileServer
  const formError = formServer.form

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: FieldErrors<Field> = {}
    if (name.trim() === '') nextErrors.name = '이름을 입력해 주세요.'
    // 전화번호 형식이 틀리면 서버는 어느 칸인지 알려 주지 않는다. 보낼 값(앞뒤 공백을 뗀 값)으로 여기서 확인한다.
    if (phone.trim() !== '' && !isMobilePhone(phone.trim())) nextErrors.phone = PHONE_FORMAT_ERROR
    setLocalErrors(nextErrors)
    // 지난번에 저장된 것이 있는지. 관계만 저장됐거나, 응답을 받지 못했는데 다시 받아 보니 저장돼 있던 경우다.
    const savedBefore =
      relationSaved || isOutcomeUnknown(changeRelation.error) || isOutcomeUnknown(update.error)
    // 지난번 결과는 지금 입력에 대한 것이 아니다.
    changeRelation.reset()
    update.reset()
    setRelationSaved(false)
    if (Object.keys(nextErrors).length > 0) return
    if (!relationChanged && !profileChanged) {
      // 더 보낼 것이 없다. 지난번에 저장된 것이 있으면 고쳤다고 알린다.
      if (savedBefore) onSaved()
      onClose()
      return
    }

    onSavingChange(true)
    // mutateAsync로 기다린다. mutate의 콜백은 폼이 사라지면(그 사이 연결이 끊김) 불리지 않아 saving이 남는다.
    try {
      // 관계를 먼저 보낸다. 응답이 바로 guardian에 반영돼, 이름·번호가 실패해 다시 저장할 때 관계는 다시 나가지 않는다.
      if (relationChanged) {
        await changeRelation.mutateAsync({ guardianId: guardian.id, relation })
        setRelationSaved(profileChanged)
      }
      if (profileChanged) {
        await update.mutateAsync({
          guardianId: guardian.id,
          body: { name: name.trim(), ...(phone.trim() === '' ? {} : { phone: phone.trim() }) },
        })
      }
      onSaved()
      onClose()
    } catch {
      // 실패는 각 요청의 error로 화면에 보여준다.
    } finally {
      onSavingChange(false)
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="mt-5 grid gap-4 text-left"
    >
      <SelectField
        label="관계"
        name="relation"
        value={relation}
        onChange={(event) => setRelation(event.target.value as Relation)}
        hint="관계는 이 학생에게만 적용돼요."
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
        hint="이름과 번호는 이 학부모에 연결된 형제에게도 함께 바뀌어요."
        error={errors.name}
      />
      <TextField
        label="새 휴대전화"
        name="phone"
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        autoComplete="off"
        placeholder="010-1234-5678"
        // 서버가 가운데를 가려서 준 번호다.
        hint={`지금 번호: ${guardian.phone}. 바꿀 때만 입력해요.`}
        error={errors.phone}
      />
      {relationSaved && update.isError && (
        <Notice tone="success">
          {isOutcomeUnknown(update.error)
            ? '관계는 저장됐어요. 이름과 번호는 저장됐는지 확인하지 못했어요.'
            : '관계는 저장됐어요. 이름과 번호는 아직 저장되지 않았어요.'}
        </Notice>
      )}
      {formError && <Notice requestId={formServer.requestId}>{formError}</Notice>}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          취소
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? '저장하는 중' : '저장'}
        </Button>
      </div>
    </form>
  )
}
