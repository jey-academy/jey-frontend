import { useState, type FormEvent } from 'react'
import { splitServerError, UNSURE_RESEND_AS_IS, type FieldErrors } from '@/shared/api'
import { formatPercent, parsePercent } from '@/shared/lib'
import { Button, Modal, Notice, Segmented, TextField } from '@/shared/ui'
import { useCreateDiscountType, useUpdateDiscountType, type DiscountType } from '../api'

type DiscountTypeFormModalProps = {
  open: boolean
  onClose: () => void
  /** 고칠 할인 유형. 없으면 새로 등록한다. */
  editing?: DiscountType
}

/** 할인 유형 등록·수정 창. 닫히면 안의 폼이 사라지므로, 다시 열 때마다 입력값이 처음 상태로 돌아간다. */
export function DiscountTypeFormModal({ open, onClose, editing }: DiscountTypeFormModalProps) {
  // 저장하는 동안에는 닫지 못하게 한다. 닫아도 요청은 끝까지 가므로, 취소한 줄 알았는데 저장되거나
  // 실패했는데 안내를 볼 곳이 없어지는 일이 생긴다.
  const [saving, setSaving] = useState(false)

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose()
      }}
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
        onSavingChange={setSaving}
      />
    </Modal>
  )
}

type FieldName = 'code' | 'name' | 'rate'

const fieldNames: FieldName[] = ['code', 'name', 'rate']
// 코드가 겹친다는 에러는 필드 목록 없이 코드로만 온다.
const codeFields = { CAMPUS_DISCOUNT_CODE_DUPLICATED: 'code' } as const

/**
 * 할인율 칸의 오류. 문제가 없으면 undefined.
 * 범위(0 초과 100% 이하)는 서버 규칙과 같다. 서버도 검사하지만 서버 문구는 비율 기준("1 이하")이라,
 * 퍼센트 칸에 그대로 보여주면 "1"을 넣으라는 말로 읽힌다. 그래서 퍼센트 기준으로 먼저 안내한다.
 */
function percentError(text: string): string | undefined {
  if (text.trim() === '') return '할인율을 입력해 주세요.'
  const rate = parsePercent(text)
  if (rate === null) {
    return '퍼센트 숫자로 입력해 주세요. 소수 둘째 자리까지 쓸 수 있어요. 예: 5'
  }
  if (rate <= 0 || rate > 1) return '0보다 크고 100 이하로 입력해 주세요.'
  return undefined
}

/** 입력한 할인율을 읽은 결과. 저장하기 전에 눈으로 확인할 수 있게 입력칸 아래에 보여준다. */
function percentPreview(text: string): string {
  const rate = parsePercent(text)
  if (rate === null) return '퍼센트로 입력해요. 예: 5'
  // 비율(0.05)로 착각해 넣으면 입력한 숫자와 미리보기 숫자가 같아 맞게 들어간 것처럼 보인다. 1% 미만이면 한 번 더 짚는다.
  if (rate > 0 && rate < 0.01) {
    return `${formatPercent(rate)} 할인이에요. 5% 할인이면 5라고 입력해요.`
  }
  return `${formatPercent(rate)} 할인`
}

type DiscountTypeFormProps = {
  onClose: () => void
  editing?: DiscountType
  saving: boolean
  onSavingChange: (saving: boolean) => void
}

function DiscountTypeForm({ onClose, editing, saving, onSavingChange }: DiscountTypeFormProps) {
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
    : { fields: {}, form: null, requestId: null }
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

    onSavingChange(true)
    const options = { onSuccess: onClose, onSettled: () => onSavingChange(false) }
    if (editing) {
      updateDiscountType.mutate({ id: editing.id, body: { name, rate, active } }, options)
    } else {
      // 붙여 넣을 때 딸려 온 앞뒤 공백은 뗀다. 눈에 안 보여서 서버가 거부해도 이유를 알기 어렵다.
      createDiscountType.mutate({ code: code.trim(), name, rate }, options)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-5 grid gap-4 text-left">
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
