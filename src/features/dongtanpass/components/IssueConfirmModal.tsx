import { Link } from 'react-router'
import { formatDate, formatWon } from '@/shared/lib'
import { Button, Modal, Notice } from '@/shared/ui'
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
  /**
   * 앞의 발급 요청의 답을 받지 못했는데 지금 내용이 그때와 다르다(#160). 다른 멱등 키로 나가므로
   * 앞의 요청이 발급됐다면 두 장이 된다. 주면 경고와 함께 이 목록을 확인하게 한다.
   */
  unsureListPath?: string | null
}

/**
 * 발급 직전의 확인 창. 결제 기록은 발급한 뒤 고칠 수 없어 한 번 더 확인하게 한다.
 * 연계 학원 발급과 JEY 발급이 같이 쓴다.
 */
export function IssueConfirmModal({
  summary,
  saving,
  onClose,
  onConfirm,
  unsureListPath = null,
}: IssueConfirmModalProps) {
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
          {unsureListPath && (
            <Notice tone="warning" className="mt-4 text-left">
              앞서 보낸 발급은 답을 받지 못해 이미 발급됐을 수 있어요. 내용이 바뀌어 이대로 보내면
              새로 한 장이 더 발급돼요. 먼저{' '}
              {/* 새 탭으로 연다. 이 화면을 떠나면 적은 내용과 앞의 요청을 다시 보낼 길이 사라진다. */}
              <Link
                to={unsureListPath}
                target="_blank"
                rel="noopener"
                className="font-semibold underline underline-offset-2"
              >
                패스 목록(새 탭)
              </Link>
              에서 발급됐는지 확인해 주세요.
            </Notice>
          )}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              다시 확인
            </Button>
            <Button onClick={onConfirm} disabled={saving}>
              {saving ? '발급하는 중' : unsureListPath ? '그래도 발급하기' : '발급하기'}
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
