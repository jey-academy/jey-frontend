import { NO_SERVER_ERRORS, splitServerError } from '@/shared/api'
import { Button, Modal, Notice, useSaving } from '@/shared/ui'
import { UNSURE_RETRY, useSetAccountDisabled, type Account } from '../api'

/**
 * 차단할지, 차단을 풀지 묻는 대상. 둘 다 창을 열 때의 값이고, 목록이 다시 받아져도 바뀌지 않는다.
 * 계정의 상태는 일부러 넣지 않는다. 방향은 `disable`만 본다.
 */
export type StatusChange = { account: Pick<Account, 'id' | 'loginId' | 'name'>; disable: boolean }

type AccountStatusModalProps = {
  onClose: () => void
  /** 없으면 창이 닫혀 있다. */
  change: StatusChange | null
  /** 바꾸는 데 성공했을 때. 화면에 남길 안내 문구를 넘긴다. */
  onDone: (message: string) => void
}

/**
 * 계정을 차단할지, 차단을 풀지 묻는 창. 계정은 지울 수 없어서 퇴사한 직원이나 잘못 만든 계정은 차단해 둔다.
 * 대상과 방향은 창을 열 때의 값을 붙잡아 둔다(StatusChange). 목록에서 다시 찾아 쓰지 않는다.
 * 응답을 놓쳤는데 서버에는 저장된 경우, 다시 받은 목록은 이미 바뀌어 있다. 다시 찾아 쓰면
 * 창의 물음이 반대로 뒤집히고 "그대로 다시 눌러도 돼요"가 반대 요청이 된다.
 */
export function AccountStatusModal({ onClose, change, onDone }: AccountStatusModalProps) {
  const setDisabled = useSetAccountDisabled()
  // 바꾸는 동안에는 닫지 못하게 한다(closable). 닫아 버리면 실패했을 때 안내를 볼 곳이 없어진다.
  const [saving, runSaving] = useSaving()

  const server = setDisabled.isError
    ? splitServerError(setDisabled.error, { fields: [], unsure: UNSURE_RETRY })
    : NO_SERVER_ERRORS

  function close() {
    // 다음에 여는 창에 지난 실패가 남지 않게 한다.
    setDisabled.reset()
    onClose()
  }

  function confirm({ account, disable }: StatusChange) {
    void runSaving(async () => {
      try {
        await setDisabled.mutateAsync({ id: account.id, disabled: disable })
      } catch {
        // 요청의 실패는 setDisabled.error로 창 안에 보여준다.
        return
      }
      onDone(
        disable
          ? `${account.loginId} 계정을 차단했어요.`
          : `${account.loginId} 계정의 차단을 풀었어요.`,
      )
      close()
    })
  }

  const who = change ? `${change.account.name}(${change.account.loginId})` : ''

  return (
    <Modal
      open={change !== null}
      onClose={close}
      closable={!saving}
      title={change?.disable ? '계정을 차단할까요?' : '차단을 풀까요?'}
      description={
        change
          ? change.disable
            ? `${who} 계정을 차단해요. 로그인할 수 없게 되고, 지금 로그인돼 있으면 바로 로그아웃돼요. 나중에 다시 풀 수 있어요.`
            : `${who} 계정의 차단을 풀어요. 쓰던 비밀번호로 다시 로그인할 수 있어요.`
          : undefined
      }
    >
      {server.form && (
        <Notice className="text-left" requestId={server.requestId}>
          {server.form}
        </Notice>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={close} disabled={saving}>
          닫기
        </Button>
        <Button
          onClick={() => {
            if (change) confirm(change)
          }}
          disabled={saving}
        >
          {change?.disable ? (saving ? '차단하는 중' : '차단') : saving ? '푸는 중' : '차단 풀기'}
        </Button>
      </div>
    </Modal>
  )
}
