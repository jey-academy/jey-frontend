import { useState, type FormEvent } from 'react'
import {
  splitServerError,
  UNSURE_RESEND_AS_IS,
  type FieldErrors,
  NO_SERVER_ERRORS,
} from '@/shared/api'
import type { Campus } from '@/shared/campus'
import { formatWon, parseWon } from '@/shared/lib'
import {
  Button,
  Modal,
  Notice,
  Segmented,
  SelectField,
  TextField,
  useRefocusAfter,
} from '@/shared/ui'
import { useCreateClass, useUpdateClass, type ClassFee } from '../api'

type ClassFormModalProps = {
  open: boolean
  onClose: () => void
  campuses: Campus[]
  /** 고칠 반. 없으면 새로 등록한다. */
  editing?: ClassFee
  /** 새로 등록할 때 처음 골라 둘 지점 */
  defaultCampusId?: number
  /** 저장에 성공했을 때. 창을 닫기 직전에 부른다. */
  onSaved?: (saved: ClassFee) => void
}

/** 반 등록·수정 창. 닫히면 안의 폼이 사라지므로, 다시 열 때마다 입력값이 처음 상태로 돌아간다. */
export function ClassFormModal({ open, onClose, ...formProps }: ClassFormModalProps) {
  // 저장하는 동안에는 닫지 못하게 한다(closable). 닫아도 요청은 끝까지 가므로, 취소한 줄 알았는데 저장되거나
  // 실패했는데 안내를 볼 곳이 없어지는 일이 생긴다.
  const [saving, setSaving] = useState(false)

  return (
    <Modal
      open={open}
      onClose={onClose}
      closable={!saving}
      title={formProps.editing ? '반 수정' : '반 등록'}
      // 입력하던 내용이 실수로 사라지지 않게 배경을 눌러도 닫지 않는다.
      closeOnBackdrop={false}
      className="max-w-[460px]"
    >
      <ClassForm
        // 대상이 바뀌면 폼을 새로 만든다. 앞의 반에 쓰던 값이 다른 반의 수정 창에 남지 않게 한다.
        key={formProps.editing?.id ?? 'new'}
        onClose={onClose}
        saving={saving}
        onSavingChange={setSaving}
        {...formProps}
      />
    </Modal>
  )
}

type FieldName = 'campusId' | 'name' | 'baseFee8' | 'bookFee'
const fieldNames: FieldName[] = ['campusId', 'name', 'baseFee8', 'bookFee']
// 이름이 겹친다는 에러는 필드 목록 없이 코드로만 온다.
const codeFields = { CAMPUS_CLASS_NAME_DUPLICATED: 'name' } as const

/** 금액 칸의 형식 오류. 문제가 없으면 undefined. 0원 초과 같은 규칙은 서버가 판단한다. */
function wonFormatError(text: string): string | undefined {
  if (text.trim() === '') return '금액을 입력해 주세요.'
  if (parseWon(text) === null) return '숫자로 입력해 주세요. 쉼표는 세 자리마다 찍어요. 예: 280,000'
  return undefined
}

/** 입력한 금액을 읽은 결과. 자릿수를 잘못 쳤는지 눈으로 확인할 수 있게 입력칸 아래에 보여준다. */
function wonPreview(text: string, fallback: string): string {
  const amount = parseWon(text)
  return amount === null ? fallback : formatWon(amount)
}

type ClassFormProps = Omit<ClassFormModalProps, 'open'> & {
  saving: boolean
  onSavingChange: (saving: boolean) => void
}

function ClassForm({
  onClose,
  campuses,
  editing,
  defaultCampusId,
  onSaved,
  saving,
  onSavingChange,
}: ClassFormProps) {
  const createClass = useCreateClass()
  const updateClass = useUpdateClass()
  const mutation = editing ? updateClass : createClass

  const [campusId, setCampusId] = useState(
    String(editing?.campusId ?? defaultCampusId ?? campuses[0]?.id ?? ''),
  )
  const [name, setName] = useState(editing?.name ?? '')
  const [baseFee8, setBaseFee8] = useState(editing ? String(editing.baseFee8) : '')
  const [bookFee, setBookFee] = useState(editing ? String(editing.bookFee) : '0')
  const [active, setActive] = useState(editing?.active ?? true)
  // 보내기 전에 걸러 낸 형식 오류. 서버가 준 오류는 mutation.error에서 읽는다.
  const [localErrors, setLocalErrors] = useState<FieldErrors<FieldName>>({})

  const refocus = useRefocusAfter(saving)
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
    // 문제가 없는 칸은 키를 넣지 않는다. undefined로 넣으면 아래에서 합칠 때 서버가 준 오류를 지워 버린다.
    const nextErrors: FieldErrors<FieldName> = {}
    const feeError = wonFormatError(baseFee8)
    const bookError = wonFormatError(bookFee)
    if (feeError) nextErrors.baseFee8 = feeError
    if (bookError) nextErrors.bookFee = bookError
    setLocalErrors(nextErrors)
    const fee = parseWon(baseFee8)
    const book = parseWon(bookFee)
    if (fee === null || book === null) {
      // 보내지 않았으니 지난번 서버 오류는 지금 입력에 대한 것이 아니다. 남겨 두면 서로 다른 말을 하는 안내가 겹친다.
      mutation.reset()
      return
    }

    onSavingChange(true)
    const options = {
      onSuccess: (saved: ClassFee) => {
        onSaved?.(saved)
        onClose()
      },
      onSettled: () => onSavingChange(false),
    }
    if (editing) {
      updateClass.mutate(
        { id: editing.id, body: { name, baseFee8: fee, bookFee: book, active } },
        options,
      )
    } else {
      createClass.mutate(
        { campusId: Number(campusId), name, baseFee8: fee, bookFee: book },
        options,
      )
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-5 grid gap-4 text-left" {...refocus}>
      {/* 저장하는 동안에는 입력칸을 막는다. 그사이 고친 값은 보낸 요청에 없다. 응답을 놓친 뒤 다시 누르면
          내용이 달라져 새 키로 나가고, 두 건이 만들어질 수 있다(UNSURE_RESEND_AS_IS).
          수정에서는 저장된 값과 화면이 달라지거나, 다시 저장할 때 뜻하지 않은 값이 나간다.
          contents(display: contents): 상자를 만들지 않아 칸들이 폼의 격자에 그대로 놓인다. */}
      <fieldset disabled={saving} className="contents">
        <SelectField
          label="지점"
          name="campusId"
          value={campusId}
          onChange={(event) => setCampusId(event.target.value)}
          // 반의 지점은 만든 뒤 바꿀 수 없다.
          disabled={Boolean(editing)}
          hint={editing ? '지점은 바꿀 수 없어요.' : undefined}
          error={errors.campusId}
        >
          {campuses.map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="반 이름"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          error={errors.name}
        />
        <TextField
          label="수강료 (8회 기준)"
          name="baseFee8"
          inputMode="numeric"
          value={baseFee8}
          onChange={(event) => setBaseFee8(event.target.value)}
          autoComplete="off"
          hint={wonPreview(baseFee8, '예: 280,000')}
          error={errors.baseFee8}
        />
        <TextField
          label="교재비"
          name="bookFee"
          inputMode="numeric"
          value={bookFee}
          onChange={(event) => setBookFee(event.target.value)}
          autoComplete="off"
          hint={wonPreview(bookFee, '교재가 없으면 0')}
          error={errors.bookFee}
        />
        {editing && (
          <Segmented
            label="운영 여부"
            name="active"
            value={active ? 'on' : 'off'}
            onChange={(value) => setActive(value === 'on')}
            options={[
              { value: 'on', label: '운영 중' },
              { value: 'off', label: '꺼짐' },
            ]}
          />
        )}
      </fieldset>
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
