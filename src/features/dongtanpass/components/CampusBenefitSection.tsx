import { useId, useState, type FormEvent } from 'react'
import {
  ApiError,
  NO_SERVER_ERRORS,
  splitServerError,
  supportRequestId,
  type FieldErrors,
} from '@/shared/api'
import { formatPercent, parsePercent, percentError, percentPreview } from '@/shared/lib'
import { Button, Card, Form, Modal, Notice, TextField } from '@/shared/ui'
import { useCampusBenefit, useChangeCampusBenefit } from '../api'

type Field = 'discountRate'
const FIELDS: Field[] = ['discountRate']

/**
 * JEY 발급 패스의 할인율(관리자, 연계 학원 화면 안). 학생이 연계 학원에 새로 등록할 때 첫 달 수강료에서 할인받는 비율이다.
 * 바꿔도 이미 발급한 패스의 할인율은 그대로다(발급 때 값이 패스에 남는다).
 */
export function CampusBenefitSection() {
  const benefit = useCampusBenefit()
  const [editing, setEditing] = useState(false)
  // 방금 바꾼 결과. 다시 바꾸기를 시작하면 지운다.
  const [done, setDone] = useState<string | null>(null)
  const titleId = useId()

  return (
    <Card role="region" aria-labelledby={titleId} className="mt-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[18px] font-bold text-ink">
            JEY 발급 패스 할인율
          </h2>
          <p className="mt-1 text-[14px] text-sub">
            JEY가 재원생에게 발급한 패스로 연계 학원에 새로 등록하면 첫 달 수강료에서 이만큼
            할인받아요. 바꿔도 이미 발급한 패스는 그대로예요.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDone(null)
            setEditing(true)
          }}
          disabled={!benefit.data}
        >
          바꾸기
        </Button>
      </div>

      {benefit.data && (
        <p className="mt-4 text-[22px] font-extrabold tabular-nums">
          {formatPercent(benefit.data.discountRate)}
        </p>
      )}
      {!benefit.data && !benefit.error && (
        <p role="status" className="mt-4 text-sub">
          할인율을 불러오고 있어요.
        </p>
      )}
      {benefit.error && (
        <div className="mt-4">
          <Notice requestId={supportRequestId(benefit.error)}>
            {benefit.data
              ? '최신 할인율을 불러오지 못했어요. 위 값은 이전 내용일 수 있어요.'
              : benefit.error instanceof ApiError
                ? benefit.error.message
                : '할인율을 불러오지 못했어요.'}
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void benefit.refetch()}
            disabled={benefit.isFetching}
          >
            {benefit.isFetching ? '불러오는 중' : '다시 불러오기'}
          </Button>
        </div>
      )}
      {done && (
        <Notice tone="success" className="mt-4">
          {done}
        </Notice>
      )}

      <Modal
        open={editing && benefit.data !== undefined}
        onClose={() => setEditing(false)}
        title="할인율 바꾸기"
        description="새로 발급하는 패스부터 바뀐 할인율이 남아요. 이미 발급한 패스는 그대로예요."
        closeOnBackdrop={false}
        className="max-w-[460px]"
      >
        {benefit.data && (
          <BenefitForm
            current={benefit.data.discountRate}
            onClose={() => setEditing(false)}
            onDone={(rate) => {
              setEditing(false)
              setDone(
                `할인율을 ${formatPercent(rate)}로 바꿨어요. 이미 발급한 패스의 할인율은 그대로예요.`,
              )
            }}
          />
        )}
      </Modal>
    </Card>
  )
}

function BenefitForm({
  current,
  onClose,
  onDone,
}: {
  current: number
  onClose: () => void
  onDone: (rate: number) => void
}) {
  const change = useChangeCampusBenefit()
  // 서버 값은 비율(0.05)이다. 입력칸에는 퍼센트 숫자(5)로 보여 준다.
  const [percent, setPercent] = useState(() => formatPercent(current).replace('%', ''))
  const [localErrors, setLocalErrors] = useState<FieldErrors<Field>>({})
  const saving = change.isPending

  // 같은 값을 다시 보내도 결과가 같다(PUT). 응답을 놓쳤으면 그대로 다시 저장하면 된다.
  const server = change.isError
    ? splitServerError(change.error, {
        fields: FIELDS,
        unsure: '바뀌었는지 확인하지 못했어요. 그대로 다시 저장해도 돼요.',
      })
    : NO_SERVER_ERRORS
  const errors: FieldErrors<Field> = { ...server.fields, ...localErrors }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const error = percentError(percent)
    const rate = parsePercent(percent)
    setLocalErrors(error ? { discountRate: error } : {})
    if (error || rate === null) {
      change.reset()
      return
    }
    change.mutate({ discountRate: rate }, { onSuccess: (saved) => onDone(saved.discountRate) })
  }

  return (
    <Form saving={saving} onSubmit={handleSubmit} className="mt-4 grid gap-3.5 text-left">
      <TextField
        label="할인율 (%)"
        name="discountRate"
        inputMode="decimal"
        value={percent}
        onChange={(event) => setPercent(event.target.value)}
        autoComplete="off"
        hint={percentPreview(percent)}
        error={errors.discountRate}
      />
      {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          닫기
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? '저장하는 중' : '저장'}
        </Button>
      </div>
    </Form>
  )
}
