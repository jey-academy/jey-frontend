import { useImperativeHandle, useRef, type Ref } from 'react'
import { PERIOD_MAX, PERIOD_MIN, type Period, type PeriodErrors } from '@/shared/lib/period'
import { TextField } from './TextField'

/** 부모가 조회할 때 묻는 것. 칸에 글자는 있는데 날짜로 읽히지 않는지(넣다 만 날짜, 달력에 없는 날짜). */
export type PeriodFieldsHandle = { badInput: () => Record<keyof Period, boolean> }

type PeriodFieldsProps = {
  /** 칸 이름표. 화면마다 무엇의 날짜인지 적는다(예: 발급일 시작, 발급일 끝). */
  labels: Record<keyof Period, string>
  value: Period
  onChange: (next: Period) => void
  errors?: PeriodErrors
  ref?: Ref<PeriodFieldsHandle>
}

/**
 * 목록 화면의 기간 칸 두 개(시작일·끝일). 감싸는 칸 없이 두 칸을 그대로 내놓아 부모 폼의 줄바꿈에 맞춰 놓인다.
 * 오류 규칙은 `periodErrors`(shared/lib/period)에 있다. 날짜로 읽히지 않는 글자는 값에 나타나지 않아(빈 값) `ref`로 묻는다.
 */
export function PeriodFields({ labels, value, onChange, errors = {}, ref }: PeriodFieldsProps) {
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(
    ref,
    () => ({
      badInput: () => ({
        from: fromRef.current?.validity.badInput ?? false,
        to: toRef.current?.validity.badInput ?? false,
      }),
    }),
    [],
  )

  return (
    <>
      <TextField
        ref={fromRef}
        label={labels.from}
        name="from"
        type="date"
        min={PERIOD_MIN}
        max={PERIOD_MAX}
        value={value.from}
        onChange={(event) => onChange({ ...value, from: event.target.value })}
        error={errors.from}
        className="w-[170px]"
      />
      <TextField
        ref={toRef}
        label={labels.to}
        name="to"
        type="date"
        min={PERIOD_MIN}
        max={PERIOD_MAX}
        value={value.to}
        onChange={(event) => onChange({ ...value, to: event.target.value })}
        error={errors.to}
        className="w-[170px]"
      />
    </>
  )
}
