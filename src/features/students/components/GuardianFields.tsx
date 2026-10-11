import { Button, SelectField, TextField } from '@/shared/ui'
import { relationOptions, type Relation } from '../labels'

/** 학부모 한 줄의 입력값. `key`는 줄을 지우고 더해도 입력칸이 뒤섞이지 않게 붙이는 번호다. */
export type GuardianInput = {
  key: number
  relation: Relation
  name: string
  /** 입력한 휴대전화 번호 원문. 화면과 요청 본문 밖으로 내보내지 않는다. */
  phone: string
}

export type GuardianErrors = { relation?: string; name?: string; phone?: string }

type GuardianFieldsProps = {
  /** 몇 번째 학부모인지 (1부터) */
  order: number
  value: GuardianInput
  errors: GuardianErrors
  onChange: (next: GuardianInput) => void
  onRemove: () => void
  disabled?: boolean
}

/** 학부모 한 명의 입력칸: 관계, 이름, 휴대전화. */
export function GuardianFields({
  order,
  value,
  errors,
  onChange,
  onRemove,
  disabled = false,
}: GuardianFieldsProps) {
  return (
    // 줄마다 묶음 이름을 붙여, 같은 이름표("이름", "휴대전화")가 어느 학부모의 것인지 구분되게 한다.
    <fieldset className="grid items-start gap-3 border-t border-line pt-4 first:border-t-0 first:pt-0 sm:grid-cols-[130px_1fr_1fr_auto]">
      <legend className="sr-only">{`학부모 ${order}`}</legend>
      <SelectField
        label="관계"
        value={value.relation}
        onChange={(event) => onChange({ ...value, relation: event.target.value as Relation })}
        disabled={disabled}
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
        value={value.name}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
        maxLength={50}
        autoComplete="off"
        disabled={disabled}
        error={errors.name}
      />
      <TextField
        label="휴대전화"
        type="tel"
        inputMode="tel"
        value={value.phone}
        onChange={(event) => onChange({ ...value, phone: event.target.value })}
        autoComplete="off"
        placeholder="010-1234-5678"
        disabled={disabled}
        error={errors.phone}
      />
      {/* 이름표 높이만큼 내려 입력칸과 나란히 둔다. */}
      <Button
        variant="ghost"
        size="sm"
        className="sm:mt-[33px]"
        aria-label={`학부모 ${order} 지우기`}
        onClick={onRemove}
        disabled={disabled}
      >
        지우기
      </Button>
    </fieldset>
  )
}
