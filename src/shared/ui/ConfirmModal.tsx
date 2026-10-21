import type { ReactNode } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

type ConfirmModalProps = {
  open: boolean
  title: string
  description?: string
  /** 확인하는 버튼의 글자(예: "결제 취소하기") */
  confirmLabel: string
  /** 돌아가는 버튼의 글자. 기본은 "돌아가기" */
  cancelLabel?: string
  onClose: () => void
  onConfirm: () => void
  /** 제목·설명과 버튼 사이에 보일 것(보낼 내용의 요약 등) */
  children?: ReactNode
}

/**
 * 되돌리기 어렵거나 돈이 걸린 처리 직전의 확인 창. 돌아가는 버튼이 왼쪽, 확인 버튼이 오른쪽이다.
 * 확인을 누르면 창을 닫는 것은 쓰는 쪽이 정한다(보낸 뒤 닫는다).
 * 보내는 동안 창을 열어 두는 곳에는 쓰지 않는다. 보내는 중 상태(닫기 막기, 버튼 끄기)가 없다.
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = '돌아가기',
  onClose,
  onConfirm,
  children,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      {children}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}
