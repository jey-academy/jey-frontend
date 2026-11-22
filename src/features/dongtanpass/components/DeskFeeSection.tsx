import { useState } from 'react'
import type { DiscountType } from '@/features/billing/api'
import {
  discountLabel,
  extraDiscounts,
  formatMonth,
  MAX_EXTRA_DISCOUNTS,
  monthChoices,
} from '@/features/billing/invoiceInput'
import { formatPercent, todayInSeoul } from '@/shared/lib'
import { Button, CheckboxField, Notice, Segmented, TextField } from '@/shared/ui'
import { NO_CLASS_REASON, type DeskFeeField, type DeskFeeInput } from '../deskFee'

type DeskFeeSectionProps = {
  value: DeskFeeInput
  onChange: (change: (current: DeskFeeInput) => DeskFeeInput) => void
  /** 등록 폼에서 고른 반 이름. 정하지 않았으면 null이다. */
  className: string | null
  /** 할인 유형(꺼진 것 포함). 받지 못했으면 null이다. */
  discountTypes: DiscountType[] | null
  /** 할인 유형을 받지 못했을 때 다시 받는다. 받는 중이면 null이다. */
  onRetryDiscounts: (() => void) | null
  /** 칸 아래 오류. `targetMonth`는 서버가 그 달에 다른 청구가 있다고 할 때다. */
  errors: Partial<Record<DeskFeeField | 'targetMonth', string>>
  /** 서버가 반을 짚어 거부했을 때의 문구(꺼진 반 등) */
  classError?: string
}

/**
 * 데스크 신규 등록 폼 아래 "이번 달 수강료" 칸(#228). 수업 횟수를 적으면 사용 처리 뒤에 청구를 만든다.
 * 비워 두면 지금처럼 사용 처리까지만 한다. 금액은 청구를 만든 뒤 서버가 계산한 값을 진행 카드에 보여 준다
 * (미리 계산 API는 등록된 학생이 있어야 해서 등록 전에는 부를 수 없다).
 */
export function DeskFeeSection({
  value,
  onChange,
  className,
  discountTypes,
  onRetryDiscounts,
  errors,
  classError,
}: DeskFeeSectionProps) {
  const [months] = useState(() => monthChoices(todayInSeoul()))
  const options = discountTypes ? extraDiscounts(discountTypes) : []
  const noClass = className === null

  return (
    <div className="grid gap-[18px]">
      <div>
        <h3 className="text-[15px] font-semibold text-sub">이번 달 수강료 (선택)</h3>
        <p className="mt-1 text-[14px] text-sub">
          수업 횟수를 적으면 패스 사용 처리 뒤에 청구를 만들어요. 비워 두면 사용 처리까지만 해요.
        </p>
      </div>

      <Segmented
        label="대상 월"
        name="targetMonth"
        options={months.map((month) => ({ value: month, label: formatMonth(month) }))}
        value={value.targetMonth}
        onChange={(targetMonth) => onChange((current) => ({ ...current, targetMonth }))}
        hint="수강료를 내는 달이에요."
        error={errors.targetMonth}
      />

      <div className="grid items-start gap-3 min-[561px]:grid-cols-[minmax(0,1fr)_140px]">
        <div>
          <p className="text-[14px] font-semibold">반</p>
          <p className="mt-2 text-[15px]">{className ?? '정하지 않음'}</p>
          <p className="mt-1 text-[13px] text-sub">
            {noClass ? NO_CLASS_REASON : '등록 폼에서 고른 반이에요.'}
          </p>
        </div>
        <TextField
          label="수업 횟수"
          inputMode="numeric"
          placeholder="예: 8"
          value={value.lessonCount}
          // 반을 정하지 않았으면 막는다. 다만 이미 적은 횟수가 있으면(반을 고른 뒤 다시 비움) 지울 수 있게 둔다.
          disabled={noClass && value.lessonCount === ''}
          onChange={(event) => {
            const lessonCount = event.target.value
            onChange((current) => ({ ...current, lessonCount }))
          }}
          error={errors.lessonCount}
        />
      </div>
      {classError && <Notice>{classError}</Notice>}

      <fieldset className="grid gap-2.5" disabled={noClass}>
        <legend className="mb-1 text-[14px] font-semibold">추가 할인 (선택)</legend>
        <p className="text-[14px] text-sub">
          {`형제 할인처럼 더 받는 할인을 ${MAX_EXTRA_DISCOUNTS}개까지 골라요. 패스 할인은 저절로 붙어요.`}
        </p>
        {discountTypes === null ? (
          <div>
            <p className="text-[14px] text-sub">
              {onRetryDiscounts ? '할인 목록을 불러오지 못했어요.' : '할인 목록을 불러오고 있어요.'}
            </p>
            {onRetryDiscounts && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={onRetryDiscounts}>
                할인 다시 불러오기
              </Button>
            )}
          </div>
        ) : options.length === 0 ? (
          <p className="text-[14px] text-sub">고를 수 있는 할인이 없어요.</p>
        ) : (
          options.map((option) => {
            const checked = value.discountCodes.includes(option.code)
            return (
              <CheckboxField
                key={option.code}
                label={discountLabel(option.name, formatPercent(option.rate))}
                checked={checked}
                disabled={!checked && value.discountCodes.length >= MAX_EXTRA_DISCOUNTS}
                onChange={(event) => {
                  const on = event.target.checked
                  onChange((current) => {
                    const chosen = new Set(current.discountCodes)
                    if (on) chosen.add(option.code)
                    else chosen.delete(option.code)
                    // 할인 목록의 순서를 지킨다(순차 방식이면 순서가 금액을 바꾼다).
                    return {
                      ...current,
                      discountCodes: options.map((item) => item.code).filter((c) => chosen.has(c)),
                    }
                  })
                }}
              />
            )
          })
        )}
        {errors.discountCodes && <Notice>{errors.discountCodes}</Notice>}
      </fieldset>

      <CheckboxField
        label="지금 결제 받음"
        hint="청구를 만든 뒤 이 화면에서 결제를 기록해요. 끄면 청구까지만 하고, 결제는 청구 상세에서 나중에 기록해요."
        checked={value.payNow}
        disabled={noClass}
        onChange={(event) => {
          const payNow = event.target.checked
          onChange((current) => ({ ...current, payNow }))
        }}
      />
    </div>
  )
}
