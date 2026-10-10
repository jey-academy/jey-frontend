import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type ModalProps = {
  /** 열려 있는지. 바깥에서 관리한다. */
  open: boolean
  /** 닫아 달라는 요청(Esc, 배경 클릭). 여기서 open을 false로 바꾼다. */
  onClose: () => void
  title: string
  description?: string
  /** 어두운 배경을 눌렀을 때 닫을지. 실수로 닫히면 곤란한 창(QR 스캔 등)에서는 끈다. */
  closeOnBackdrop?: boolean
  /** 창 안에 넣을 내용. 닫을 방법(닫기 버튼)을 반드시 포함한다. 창이 닫혀 있는 동안에는 그려지지 않는다. */
  children?: ReactNode
  className?: string
}

/**
 * 화면 위에 뜨는 창. 브라우저의 `<dialog>`를 쓴다.
 * 포커스를 창 안에 가두기, 뒤 화면 비활성, 닫힌 뒤 포커스 되돌리기는 브라우저가 처리한다.
 * 열려 있는 동안의 배경 스크롤 잠금은 index.css에서 한다.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  closeOnBackdrop = true,
  children,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pressedOnBackdrop = useRef(false)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Esc: 브라우저가 바로 닫지 않게 막고, 닫을지는 바깥(open)이 정하게 한다.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // 브라우저가 스스로 닫은 경우에도 바깥 상태를 맞춘다.
      onClose={() => {
        if (open) onClose()
      }}
      // 배경(::backdrop)을 누르면 이벤트 대상이 dialog 자신이다. 안쪽 내용은 아래 div가 덮고 있다.
      // 창 안에서 누른 채 밖으로 끌어 놓은 경우는 닫지 않도록, 누르기 시작한 곳도 확인한다.
      onMouseDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (closeOnBackdrop && pressedOnBackdrop.current && event.target === event.currentTarget) {
          onClose()
        }
      }}
      className={cn(
        // display 계열 클래스는 붙이지 않는다. 닫힌 dialog를 숨기는 브라우저 기본 스타일을 덮어쓴다.
        'm-auto max-h-[calc(100dvh-40px)] w-[calc(100%-40px)] max-w-[420px] overflow-y-auto rounded-pass bg-card p-0 text-ink',
        'backdrop:bg-ink/78 backdrop:backdrop-blur-[4px]',
        className,
      )}
    >
      {open && (
        <div className="p-[22px] text-center">
          <h2 id={titleId} className="my-1 text-[20px] font-bold tracking-[-0.03em]">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mb-4 text-[15px] text-sub">
              {description}
            </p>
          )}
          {children}
        </div>
      )}
    </dialog>
  )
}
