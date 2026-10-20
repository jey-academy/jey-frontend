import { useEffect, useRef } from 'react'
import { supportRequestId } from '@/shared/api'
import { Button, Modal, Notice } from '@/shared/ui'
import { useRegeneratePassLink, type LedgerItem, type PassIssuer } from '../api'
import { passActionErrorMessage } from '../passActionError'
import { HolderLinkCopy } from './HolderLinkCopy'

type PassLinkModalProps = {
  /** 패스를 낸 쪽. 요청 주소와 다시 받을 목록이 다르다. */
  issuer: PassIssuer
  /** 링크를 새로 만들 패스. 없으면 창이 닫혀 있다. 창을 열 때의 값이고, 장부가 다시 받아져도 바뀌지 않는다. */
  pass: Pick<LedgerItem, 'id' | 'passNo' | 'studentName'> | null
  onClose: () => void
}

const UNSURE = '새 링크가 만들어졌는지 확인하지 못했어요. 그대로 다시 누르면 같은 링크를 받아요.'

/**
 * 장부 줄의 "링크 새로 만들기" 창. 확인을 받고 새 링크를 만들어, 같은 창에서 보여 주고 복사하게 한다.
 * 새 링크는 이 응답에만 있다. 창을 닫으면 다시 볼 수 없다(다시 만들면 또 바뀐다).
 * 창은 늘 그려 두고 열고 닫기만 한다. 닫힐 때 브라우저가 포커스를 연 버튼으로 돌려놓는다.
 */
export function PassLinkModal({ issuer, pass, onClose }: PassLinkModalProps) {
  const regenerate = useRegeneratePassLink(issuer, pass?.id ?? null)
  const saving = regenerate.isPending
  const result = useRef<HTMLDivElement>(null)
  const linkToken = regenerate.data?.linkToken

  // 만들고 나면 누른 버튼이 사라진다. 포커스를 "링크 복사"로 옮겨, 이어서 바로 복사할 수 있게 한다.
  useEffect(() => {
    if (linkToken) result.current?.querySelector('button')?.focus()
  }, [linkToken])

  function close() {
    // 새 링크(토큰)와 지난 실패를 지운다. 다음에 여는 창에 남지 않게 한다.
    regenerate.reset()
    onClose()
  }

  return (
    <Modal
      open={pass !== null}
      onClose={close}
      closable={!saving}
      title={linkToken ? '새 링크를 만들었어요' : '링크를 새로 만들까요?'}
      description={
        pass
          ? linkToken
            ? `${pass.studentName} 학생(${pass.passNo})의 새 링크예요. 예전 링크는 더 쓸 수 없어요. 학부모님께 이 링크를 다시 보내 주세요.`
            : `${pass.studentName} 학생(${pass.passNo})의 링크를 새로 만들어요. 예전 링크는 더 쓸 수 없게 돼요.`
          : undefined
      }
    >
      {linkToken ? (
        <>
          <div ref={result}>
            <HolderLinkCopy key={linkToken} linkToken={linkToken} />
          </div>
          <p className="mt-3 text-left text-[13px] text-sub">
            이 링크는 지금만 볼 수 있어요. 창을 닫으면 다시 볼 수 없어요.
          </p>
          <Button variant="ghost" block className="mt-5" onClick={close}>
            닫기
          </Button>
        </>
      ) : (
        <>
          {regenerate.isError && (
            <Notice className="text-left" requestId={supportRequestId(regenerate.error)}>
              {passActionErrorMessage(regenerate.error, UNSURE)}
            </Notice>
          )}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={close} disabled={saving}>
              닫기
            </Button>
            <Button onClick={() => regenerate.mutate()} disabled={saving}>
              {saving ? '만드는 중' : '새로 만들기'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
