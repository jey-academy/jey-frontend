import { supportRequestId } from '@/shared/api'
import { Button, Modal, Notice } from '@/shared/ui'
import { useCancelPass, type LedgerItem, type PassIssuer } from '../api'
import { passActionErrorMessage } from '../passActionError'

type PassCancelModalProps = {
  /** 패스를 낸 쪽. 요청 주소와 다시 받을 목록, 결제 안내가 다르다. */
  issuer: PassIssuer
  /** 취소할 패스. 없으면 창이 닫혀 있다. 창을 열 때의 값이고, 목록이 다시 받아져도 바뀌지 않는다. */
  pass: Pick<LedgerItem, 'id' | 'passNo' | 'studentName'> | null
  onClose: () => void
  /** 취소에 성공했을 때. 화면에 남길 안내 문구를 넘긴다. */
  onDone: (message: string) => void
}

const UNSURE = '취소됐는지 확인하지 못했어요. 그대로 다시 눌러도 한 번만 취소돼요.'

// 결제 안내. 연계 학원 발급은 패스를 사려고 낸 돈이라 학원이 따로 환불한다.
// JEY 발급의 근거 결제는 그 달의 수강료라 패스를 취소해도 그대로다.
const paymentNotice: Record<PassIssuer, { warning: string; done: string }> = {
  partner: {
    warning: '결제 환불은 앱에서 되지 않아요. 취소한 뒤 학원에서 따로 환불해 주세요.',
    done: '결제 환불은 학원에서 따로 해 주세요.',
  },
  campus: {
    warning: '근거로 적은 수강료 결제는 그대로예요. 패스만 취소돼요.',
    done: '수강료 결제는 그대로예요.',
  },
}

/**
 * 목록 줄의 "취소" 창. 되돌릴 수 없으니 확인을 받는다. 결제가 어떻게 되는지 알린다.
 * 창은 늘 그려 두고 열고 닫기만 한다(PassLinkModal과 같다).
 */
export function PassCancelModal({ issuer, pass, onClose, onDone }: PassCancelModalProps) {
  const cancel = useCancelPass(issuer, pass?.id ?? null)
  const notice = paymentNotice[issuer]
  const saving = cancel.isPending

  function close() {
    // 다음에 여는 창에 지난 실패가 남지 않게 한다.
    cancel.reset()
    onClose()
  }

  function confirm(target: NonNullable<PassCancelModalProps['pass']>) {
    cancel.mutate(undefined, {
      onSuccess: () => {
        onDone(`${target.studentName} 학생의 패스(${target.passNo})를 취소했어요. ${notice.done}`)
        close()
      },
    })
  }

  return (
    <Modal
      open={pass !== null}
      onClose={close}
      closable={!saving}
      title="패스를 취소할까요?"
      description={
        pass
          ? `${pass.studentName} 학생의 패스(${pass.passNo})를 취소해요. 되돌릴 수 없고, 학부모 링크도 더 쓸 수 없어요.`
          : undefined
      }
    >
      <Notice tone="warning" className="text-left">
        {notice.warning}
      </Notice>
      {cancel.isError && (
        <Notice className="mt-3 text-left" requestId={supportRequestId(cancel.error)}>
          {passActionErrorMessage(cancel.error, UNSURE)}
        </Notice>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={close} disabled={saving}>
          닫기
        </Button>
        <Button
          onClick={() => {
            if (pass) confirm(pass)
          }}
          disabled={saving}
        >
          {saving ? '취소하는 중' : '패스 취소하기'}
        </Button>
      </div>
    </Modal>
  )
}
