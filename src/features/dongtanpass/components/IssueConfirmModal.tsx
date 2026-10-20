import { formatDate, formatWon } from '@/shared/lib'
import { Button, Modal } from '@/shared/ui'
import { paymentMethodLabels, type PaymentMethod } from '../paymentMethods'

/** 확인 창에 보여 줄 발급 내용 */
export type IssueSummary = {
  studentName: string
  paidOn: string
  paidAmount: number
  paymentMethod: PaymentMethod
}

type IssueConfirmModalProps = {
  /** 보여 줄 내용. null이면 창이 닫혀 있다. */
  summary: IssueSummary | null
  saving: boolean
  onClose: () => void
  onConfirm: () => void
}

/**
 * 발급 직전의 확인 창. 결제 기록은 발급한 뒤 고칠 수 없어 한 번 더 확인하게 한다.
 * 연계 학원 발급과 JEY 발급이 같이 쓴다.
 */
export function IssueConfirmModal({ summary, saving, onClose, onConfirm }: IssueConfirmModalProps) {
  return (
    <Modal
      open={summary !== null}
      onClose={onClose}
      closable={!saving}
      title="이대로 발급할까요?"
      description="발급한 뒤에는 결제 기록을 고칠 수 없어요. 틀렸다면 취소하고 다시 발급해야 해요."
    >
      {summary && (
        <>
          <dl className="mt-4 grid gap-2.5 rounded-md bg-field px-[18px] py-4 text-left text-[15px]">
            <SummaryRow label="학생 이름" value={summary.studentName} />
            <SummaryRow label="결제일" value={formatDate(summary.paidOn)} />
            <SummaryRow label="결제 금액" value={formatWon(summary.paidAmount)} />
            <SummaryRow label="결제 수단" value={paymentMethodLabels[summary.paymentMethod]} />
          </dl>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              다시 확인
            </Button>
            <Button onClick={onConfirm} disabled={saving}>
              {saving ? '발급하는 중' : '발급하기'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-sub">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
