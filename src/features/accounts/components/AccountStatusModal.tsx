import { NO_SERVER_ERRORS } from '@/shared/api'
import { Button, Modal, Notice, useSaving } from '@/shared/ui'
import { splitAccountError, UNSURE_RETRY, useSetAccountDisabled, type Account } from '../api'

/** 차단할지, 차단을 풀지 묻는 대상. `disable`은 창을 열 때 정한 방향이다. */
export type StatusChange = { account: Account; disable: boolean }

type AccountStatusModalProps = {
  onClose: () => void
  /** 없으면 창이 닫혀 있다. */
  change: StatusChange | null
  /** 바꾸는 데 성공했을 때. 화면에 남길 안내 문구를 넘긴다. */
  onDone: (message: string) => void
}

/**
 * 계정을 차단할지, 차단을 풀지 묻는 창. 계정은 지울 수 없어서 퇴사한 직원이나 잘못 만든 계정은 차단해 둔다.
 * 방향은 창을 열 때 정해 둔다. 계정의 지금 상태로 정하면, 저장은 됐는데 실패로 온 경우(로그아웃만 못 시킴)에
 * 다시 받은 목록을 따라 창의 물음이 반대로 뒤집힌다.
 */
export function AccountStatusModal({ onClose, change, onDone }: AccountStatusModalProps) {
  const setDisabled = useSetAccountDisabled()
  // 바꾸는 동안에는 닫지 못하게 한다(closable). 실패했을 때 안내를 볼 곳이 없어진다.
  const [saving, runSaving] = useSaving()

  const server = setDisabled.isError
    ? splitAccountError(setDisabled.error, { fields: [], unsure: UNSURE_RETRY })
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
