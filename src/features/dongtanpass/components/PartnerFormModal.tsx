import { useState, type FormEvent } from 'react'
import {
  NO_SERVER_ERRORS,
  splitServerError,
  UNSURE_RESEND_AS_IS,
  type FieldErrors,
} from '@/shared/api'
import { Button, Form, Modal, Notice, TextField, useSaving, type SavingProps } from '@/shared/ui'
import { useCreatePartner } from '../api'

type PartnerFormModalProps = {
  open: boolean
  onClose: () => void
  /** 만드는 데 성공했을 때. 화면에 남길 안내 문구를 넘긴다. */
  onDone: (message: string) => void
}

/** 연계 학원 만들기 창. 닫히면 안의 폼이 사라지므로, 다시 열 때마다 입력값이 처음 상태로 돌아간다. */
export function PartnerFormModal({ open, onClose, onDone }: PartnerFormModalProps) {
  // 만드는 동안에는 닫지 못하게 한다(closable). 닫아도 요청은 끝까지 가므로, 실패했을 때 안내를 볼 곳이 없어진다.
  const [saving, runSaving] = useSaving()

  return (
    <Modal
      open={open}
      onClose={onClose}
      closable={!saving}
      title="연계 학원 만들기"
      // 입력하던 내용이 실수로 사라지지 않게 배경을 눌러도 닫지 않는다.
      closeOnBackdrop={false}
      className="max-w-[460px]"
    >
      <PartnerForm onClose={onClose} onDone={onDone} saving={saving} runSaving={runSaving} />
    </Modal>
  )
}

type FieldName = 'name'
// 서버가 받는 이름의 최대 길이
const NAME_MAX_LENGTH = 50

type PartnerFormProps = {
  onClose: () => void
  onDone: (message: string) => void
} & SavingProps

function PartnerForm({ onClose, onDone, saving, runSaving }: PartnerFormProps) {
  const create = useCreatePartner()
  const [name, setName] = useState('')
  // 보내기 전에 걸러 낸 오류. 서버가 준 오류는 create.error에서 읽는다.
  const [localErrors, setLocalErrors] = useState<FieldErrors<FieldName>>({})

  const server = create.isError
    ? splitServerError(create.error, {
        fields: ['name'],
        // 이름이 겹친다는 에러는 필드 목록 없이 코드로만 온다.
        codes: { DONGTANPASS_PARTNER_NAME_DUPLICATED: 'name' },
        // 멱등 키를 싣는다. 그대로 다시 눌러도 한 번만 만들어진다.
        unsure: UNSURE_RESEND_AS_IS,
      })
    : NO_SERVER_ERRORS
  const errors: FieldErrors<FieldName> = { ...server.fields, ...localErrors }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // 서버도 앞뒤 공백을 떼고 받는다. 보낼 값으로 미리 본다.
    const trimmed = name.trim()
    const nextErrors: FieldErrors<FieldName> =
      trimmed === '' ? { name: '학원 이름을 입력해 주세요.' } : {}
    setLocalErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      // 보내지 않았으니 지난번 서버 오류는 지금 입력에 대한 것이 아니다.
      create.reset()
      return
    }

    void runSaving(async () => {
      let created
      try {
        created = await create.mutateAsync({ name: trimmed })
      } catch {
        // 요청의 실패는 create.error로 폼에 보여준다.
        return
      }
      onDone(`${created.name} 학원을 만들었어요. 이어서 이 학원의 계정을 만들어 주세요.`)
      onClose()
    })
  }

  return (
    <Form saving={saving} onSubmit={handleSubmit} className="mt-5 grid gap-4 text-left">
      <TextField
        label="학원 이름"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={NAME_MAX_LENGTH}
        autoComplete="off"
        hint="다른 학원과 같은 이름은 쓸 수 없어요. 대소문자만 달라도 같은 이름으로 봐요."
        error={errors.name}
      />
      {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button type="submit">{saving ? '만드는 중' : '만들기'}</Button>
      </div>
    </Form>
  )
}
