import { useState, type FormEvent } from 'react'
import { ApiError } from '@/shared/api'
import { parseWon } from '@/shared/lib'
import { Button, Modal, Notice, Segmented, SelectField, TextField } from '@/shared/ui'
import { useCreateClass, useUpdateClass, type Campus, type ClassFee } from '../api'

type ClassFormModalProps = {
  open: boolean
  onClose: () => void
  campuses: Campus[]
  /** 고칠 반. 없으면 새로 등록한다. */
  editing?: ClassFee
  /** 새로 등록할 때 처음 골라 둘 지점 */
  defaultCampusId?: number
}

/** 반 등록·수정 창. 닫히면 안의 폼이 사라지므로, 다시 열 때마다 입력값이 처음 상태로 돌아간다. */
export function ClassFormModal({ open, onClose, ...formProps }: ClassFormModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={formProps.editing ? '반 수정' : '반 등록'}
      // 입력하던 내용이 실수로 사라지지 않게 배경을 눌러도 닫지 않는다.
      closeOnBackdrop={false}
      className="max-w-[460px]"
    >
      <ClassForm onClose={onClose} {...formProps} />
    </Modal>
  )
}

type FieldName = 'campusId' | 'name' | 'baseFee8' | 'bookFee'
type FieldErrors = Partial<Record<FieldName, string>>

const fieldNames: FieldName[] = ['campusId', 'name', 'baseFee8', 'bookFee']
const NOT_A_NUMBER = '숫자만 입력해 주세요.'

/** 서버가 준 에러를 입력칸별 문구와 폼 전체 문구로 나눈다. */
function splitServerError(error: unknown): { fields: FieldErrors; form: string | null } {
  if (!(error instanceof ApiError)) {
    return { fields: {}, form: '저장하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }
  // 이름이 겹친다는 에러는 필드 목록 없이 코드로만 온다.
  if (error.code === 'CAMPUS_CLASS_NAME_DUPLICATED') {
    return { fields: { name: error.message }, form: null }
  }
  const fields: FieldErrors = {}
  for (const { field, message } of error.fieldErrors) {
    if (fieldNames.includes(field as FieldName)) fields[field as FieldName] ??= message
  }
  // 어느 칸의 문제인지 하나라도 짚었으면 "입력값이 올바르지 않습니다" 같은 전체 문구는 되풀이하지 않는다.
  return { fields, form: Object.keys(fields).length > 0 ? null : error.message }
}

function ClassForm({
  onClose,
  campuses,
  editing,
  defaultCampusId,
}: Omit<ClassFormModalProps, 'open'>) {
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
  const [localErrors, setLocalErrors] = useState<FieldErrors>({})

  const server = mutation.isError ? splitServerError(mutation.error) : { fields: {}, form: null }
  const errors: FieldErrors = { ...server.fields, ...localErrors }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // 금액은 숫자로 읽히는지만 본다. 0원 초과 같은 규칙은 서버가 판단하고, 그 답을 그대로 보여준다.
    const fee = parseWon(baseFee8)
    const book = parseWon(bookFee)
    const nextErrors: FieldErrors = {}
    if (fee === null) nextErrors.baseFee8 = NOT_A_NUMBER
    if (book === null) nextErrors.bookFee = NOT_A_NUMBER
    setLocalErrors(nextErrors)
    if (fee === null || book === null) return

    const options = { onSuccess: onClose }
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
    <form onSubmit={handleSubmit} noValidate className="mt-5 grid gap-4 text-left">
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
        hint="원 단위로 입력해요. 예: 280000"
        error={errors.baseFee8}
      />
      <TextField
        label="교재비"
        name="bookFee"
        inputMode="numeric"
        value={bookFee}
        onChange={(event) => setBookFee(event.target.value)}
        autoComplete="off"
        hint="교재가 없으면 0"
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
      {server.form && <Notice>{server.form}</Notice>}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? '저장하는 중' : '저장'}
        </Button>
      </div>
    </form>
  )
}
