import { ApiError, CODE_ERROR_MESSAGE, isOutcomeUnknown, supportRequestId } from '@/shared/api'
import type { Partner } from '@/shared/partner'
import { Button, Modal, Notice, useSaving } from '@/shared/ui'
import { useSetPartnerActive } from '../api'

type PartnerDeactivateModalProps = {
  onClose: () => void
  /** 끌 학원. 없으면 창이 닫혀 있다. 창을 열 때의 값이고, 목록이 다시 받아져도 바뀌지 않는다. */
  partner: Pick<Partner, 'id' | 'name'> | null
  /** 끄는 데 성공했을 때. 화면에 남길 안내 문구를 넘긴다. */
  onDone: (message: string) => void
}

/** 끄기가 실패했을 때 창 안에 보여줄 문구. */
function deactivateErrorMessage(error: unknown): string {
  // 화면 코드의 버그다.
  if (!(error instanceof ApiError)) return CODE_ERROR_MESSAGE
  // 보내지 않았다(CSRF 토큰을 받지 못함). 토큰 요청이 5xx였어도 끄기와는 상관없다.
  if (error.notSent) return error.message
  // 서버 오류면 학원은 꺼졌는데 계정 일부가 차단되지 않은 것이다. 다시 보내면 남은 계정을 차단한다.
  if (error.kind === 'http' && error.status !== null && error.status >= 500) {
    return '일부 계정을 차단하지 못했어요. 다시 눌러 남은 계정을 차단해 주세요. 그동안에도 이 학원의 계정은 패스 기능을 쓸 수 없어요.'
  }
  // 응답을 받지 못했다. 같은 요청을 다시 보내도 결과가 같다.
  if (isOutcomeUnknown(error))
    return `${error.message} 꺼졌는지 확인하지 못했어요. 그대로 다시 눌러도 돼요.`
  return error.message
}

/**
 * 연계 학원을 끌지 묻는 창. 끄면 그 학원의 계정이 모두 차단되고 로그아웃된다. 이미 발급한 패스는 쓸 수 있다.
 * 대상은 창을 열 때의 값을 붙잡아 둔다. 응답을 놓쳤는데 꺼져 있던 경우 다시 받은 목록은 이미 꺼진 학원이다.
 */
export function PartnerDeactivateModal({ onClose, partner, onDone }: PartnerDeactivateModalProps) {
  const setActive = useSetPartnerActive()
  // 끄는 동안에는 닫지 못하게 한다(closable). 닫아 버리면 실패했을 때 안내를 볼 곳이 없어진다.
  const [saving, runSaving] = useSaving()

  function close() {
    // 다음에 여는 창에 지난 실패가 남지 않게 한다.
    setActive.reset()
    onClose()
  }

  function confirm(target: Pick<Partner, 'id' | 'name'>) {
    void runSaving(async () => {
      try {
        await setActive.mutateAsync({ id: target.id, active: false })
      } catch {
        // 요청의 실패는 setActive.error로 창 안에 보여준다.
        return
      }
      onDone(`${target.name} 학원을 껐어요. 이 학원의 계정은 모두 차단됐어요.`)
      close()
    })
  }

  return (
    <Modal
      open={partner !== null}
      onClose={close}
      closable={!saving}
      title="학원을 끌까요?"
      description={
        partner
          ? `${partner.name} 학원의 계정이 모두 차단되고, 로그인돼 있으면 바로 로그아웃돼요. 새 패스는 발급할 수 없고, 이미 발급한 패스는 그대로 쓸 수 있어요.`
          : undefined
      }
    >
      {setActive.isError && (
        <Notice className="text-left" requestId={supportRequestId(setActive.error)}>
          {deactivateErrorMessage(setActive.error)}
        </Notice>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={close} disabled={saving}>
          닫기
        </Button>
        <Button
          onClick={() => {
            if (partner) confirm(partner)
          }}
          disabled={saving}
        >
          {saving ? '끄는 중' : '끄기'}
        </Button>
      </div>
    </Modal>
  )
}
