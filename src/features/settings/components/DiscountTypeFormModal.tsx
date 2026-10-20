import { useState, type FormEvent } from 'react'
import {
  splitServerError,
  UNSURE_RESEND_AS_IS,
  type FieldErrors,
  NO_SERVER_ERRORS,
} from '@/shared/api'
import { formatPercent, parsePercent, percentError, percentPreview } from '@/shared/lib'
import {
  Button,
  Modal,
  Notice,
  Segmented,
  TextField,
  Form,
  useSaving,
  type SavingProps,
} from '@/shared/ui'
import { useCreateDiscountType, useUpdateDiscountType, type DiscountType } from '../api'

type DiscountTypeFormModalProps = {
  open: boolean
  onClose: () => void
  /** 고칠 할인 유형. 없으면 새로 등록한다. */
  editing?: DiscountType
}

/** 할인 유형 등록·수정 창. 닫히면 안의 폼이 사라지므로, 다시 열 때마다 입력값이 처음 상태로 돌아간다. */
export function DiscountTypeFormModal({ open, onClose, editing }: DiscountTypeFormModalProps) {
  // 저장하는 동안에는 닫지 못하게 한다(closable). 닫아도 요청은 끝까지 가므로, 취소한 줄 알았는데 저장되거나
  // 실패했는데 안내를 볼 곳이 없어지는 일이 생긴다.
  const [saving, runSaving] = useSaving()

  return (
    <Modal
      open={open}
      onClose={onClose}
      closable={!saving}
      title={editing ? '할인 유형 수정' : '할인 유형 등록'}
      // 입력하던 내용이 실수로 사라지지 않게 배경을 눌러도 닫지 않는다.
      closeOnBackdrop={false}
      className="max-w-[460px]"
    >
      <DiscountTypeForm
        // 대상이 바뀌면 폼을 새로 만든다. 앞의 것에 쓰던 값이 다른 수정 창에 남지 않게 한다.
        key={editing?.id ?? 'new'}
        onClose={onClose}
        editing={editing}
        saving={saving}
        runSaving={runSaving}
      />
    </Modal>
  )
}

type FieldName = 'code' | 'name' | 'rate'

const fieldNames: FieldName[] = ['code', 'name', 'rate']
// 코드가 겹친다는 에러는 필드 목록 없이 코드로만 온다.
const codeFields = { CAMPUS_DISCOUNT_CODE_DUPLICATED: 'code' } as const

type DiscountTypeFormProps = {
  onClose: () => void
  editing?: DiscountType
} & SavingProps

function DiscountTypeForm({ onClose, editing, saving, runSaving }: DiscountTypeFormProps) {
  const createDiscountType = useCreateDiscountType()
  const updateDiscountType = useUpdateDiscountType()
  const mutation = editing ? updateDiscountType : createDiscountType

  const [code, setCode] = useState(editing?.code ?? '')
  const [name, setName] = useState(editing?.name ?? '')
  // 서버 값은 비율(0.05)이다. 입력칸에는 퍼센트 숫자(5)로 보여준다.
  const [percent, setPercent] = useState(
    editing ? formatPercent(editing.rate).replace('%', '') : '',
  )
  const [active, setActive] = useState(editing?.active ?? true)
  // 보내기 전에 걸러 낸 형식 오류. 서버가 준 오류는 mutation.error에서 읽는다.
  const [localErrors, setLocalErrors] = useState<FieldErrors<FieldName>>({})

  const server = mutation.isError
    ? splitServerError(mutation.error, {
        fields: fieldNames,
        codes: codeFields,
        // 등록은 멱등 키를 싣는다. 수정은 싣지 않으므로 기본 안내(목록 확인)를 쓴다.
        ...(editing ? {} : { unsure: UNSURE_RESEND_AS_IS }),
      })
    : NO_SERVER_ERRORS
  const errors: FieldErrors<FieldName> = { ...server.fields, ...localErrors }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // 문제가 없는 칸은 키를 넣지 않는다. undefined로 넣으면 위에서 합칠 때 서버가 준 오류를 지워 버린다.
    const nextErrors: FieldErrors<FieldName> = {}
    const rateError = percentError(percent)
    if (rateError) nextErrors.rate = rateError
    setLocalErrors(nextErrors)
    const rate = parsePercent(percent)
    if (rate === null || rateError) {
      // 보내지 않았으니 지난번 서버 오류는 지금 입력에 대한 것이 아니다.
      mutation.reset()
      return
    }

    void runSaving(async () => {
      try {
        if (editing) {
          await updateDiscountType.mutateAsync({ id: editing.id, body: { name, rate, active } })
        } else {
          // 붙여 넣을 때 딸려 온 앞뒤 공백은 뗀다. 눈에 안 보여서 서버가 거부해도 이유를 알기 어렵다.
          await createDiscountType.mutateAsync({ code: code.trim(), name, rate })
        }
      } catch {
        // 요청의 실패는 mutation.error로 화면에 보여준다.
        return
      }
      onClose()
    })
  }

  return (
    <Form saving={saving} onSubmit={handleSubmit} className="mt-5 grid gap-4 text-left">
      <TextField
        label="코드"
        name="code"
        value={code}
        // 코드는 대문자만 받는다. 소문자로 쳐도 대문자로 바꿔 준다.
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        // 코드는 만든 뒤 바꿀 수 없다.
        disabled={Boolean(editing)}
        hint={
          editing
            ? '코드는 바꿀 수 없어요.'
            : '대문자로 시작하고 대문자, 숫자, 밑줄로 2~30자. 만든 뒤에는 바꿀 수 없어요. 예: SIBLING_5'
        }
        error={errors.code}
      />
      <TextField
        label="이름"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="off"
        error={errors.name}
      />
      <TextField
        label="할인율 (%)"
        name="rate"
        inputMode="decimal"
        value={percent}
        onChange={(event) => setPercent(event.target.value)}
        autoComplete="off"
        hint={percentPreview(percent)}
        error={errors.rate}
      />
      {editing && (
        <Segmented
          label="사용 여부"
          name="active"
          value={active ? 'on' : 'off'}
          onChange={(value) => setActive(value === 'on')}
          options={[
            { value: 'on', label: '사용 중' },
            { value: 'off', label: '꺼짐' },
          ]}
        />
      )}
      {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button type="submit">{saving ? '저장하는 중' : '저장'}</Button>
      </div>
    </Form>
  )
}
