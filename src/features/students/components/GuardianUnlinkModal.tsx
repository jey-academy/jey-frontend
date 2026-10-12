import { Button, Modal, Notice } from '@/shared/ui'
import type { Guardian } from '../api'
import { relationLabel } from '../labels'

type GuardianUnlinkModalProps = {
  onClose: () => void
  studentName: string
  /** 끊을지 묻는 학부모. 없으면 창이 닫힌다. */
  guardian: Guardian | null
  onConfirm: (guardian: Guardian) => void
  pending: boolean
  /** 실패했을 때의 안내 */
  error: string | null
  /** 실패한 요청의 번호. 안내 아래에 보여준다. */
  requestId: string | null
}

/** 학부모 연결을 끊을지 묻는 창. 요청과 그 결과는 상세 화면이 맡는다(창을 닫아도 결과가 화면에 남는다). */
export function GuardianUnlinkModal({
  onClose,
  studentName,
  guardian,
  onConfirm,
  pending,
  error,
  requestId,
}: GuardianUnlinkModalProps) {
  return (
    <Modal
      open={guardian !== null}
      // 끊는 중에도 닫을 수 있다. 결과는 화면의 안내로 남는다.
      onClose={onClose}
      title="학부모 연결을 끊을까요?"
      description={
        guardian
          ? // 서버가 가운데를 가려서 준 번호다.
            `${studentName} 학생에게서 ${relationLabel(guardian.relation)} ${guardian.name}(${guardian.phone})의 연결을 끊어요. 학부모 정보는 지워지지 않고, 형제에게 연결돼 있으면 그대로예요.`
          : undefined
      }
    >
      {error && (
        <Notice className="text-left" requestId={requestId}>
          {error}
        </Notice>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          닫기
        </Button>
        <Button
          onClick={() => {
            if (guardian) onConfirm(guardian)
          }}
          disabled={pending}
        >
          {pending ? '끊는 중' : '연결 끊기'}
        </Button>
      </div>
    </Modal>
  )
}
