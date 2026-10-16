import { supportRequestId } from '@/shared/api'
import { Button, Modal, Notice } from '@/shared/ui'
import { useCancelPass, type LedgerItem } from '../api'
import { passActionErrorMessage } from '../passActionError'

type PassCancelModalProps = {
  /** 취소할 패스. 없으면 창이 닫혀 있다. 창을 열 때의 값이고, 장부가 다시 받아져도 바뀌지 않는다. */
  pass: Pick<LedgerItem, 'id' | 'passNo' | 'studentName'> | null
  onClose: () => void
  /** 취소에 성공했을 때. 화면에 남길 안내 문구를 넘긴다. */
  onDone: (message: string) => void
}

const UNSURE = '취소됐는지 확인하지 못했어요. 그대로 다시 눌러도 한 번만 취소돼요.'

/**
 * 장부 줄의 "취소" 창. 되돌릴 수 없으니 확인을 받는다. 결제 환불은 학원이 따로 한다고 알린다.
 * 창은 늘 그려 두고 열고 닫기만 한다(PassLinkModal과 같다).
 */
export function PassCancelModal({ pass, onClose, onDone }: PassCancelModalProps) {
  const cancel = useCancelPass(pass?.id ?? null)
  const saving = cancel.isPending

  function close() {
    // 다음에 여는 창에 지난 실패가 남지 않게 한다.
    cancel.reset()
    onClose()
  }

  function confirm(target: NonNullable<PassCancelModalProps['pass']>) {
    cancel.mutate(undefined, {
      onSuccess: () => {
        onDone(
          `${target.studentName} 학생의 패스(${target.passNo})를 취소했어요. 결제 환불은 학원에서 따로 해 주세요.`,
        )
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
        결제 환불은 앱에서 되지 않아요. 취소한 뒤 학원에서 따로 환불해 주세요.
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
