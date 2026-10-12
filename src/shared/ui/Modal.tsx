import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type ModalProps = {
  /** 열려 있는지. 바깥에서 관리한다. */
  open: boolean
  /**
   * 닫아 달라는 요청(Esc, 배경 클릭). 닫으려면 open을 false로 바꾼다.
   * 닫으면 안 될 때(저장하는 중 등)는 무시해도 된다. 브라우저가 창을 스스로 닫아 버린 경우에도 다시 연다.
   */
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
  // 브라우저가 창을 스스로 닫을 때마다 올린다. 아래 효과를 다시 돌려 창과 open을 맞춘다.
  const [forcedCloses, setForcedCloses] = useState(0)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    // 바깥이 닫기를 받아들이지 않았는데(open이 그대로) 브라우저가 닫아 버린 창도 여기서 다시 열린다.
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open, forcedCloses])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Esc: 브라우저가 바로 닫지 않게 막고, 닫을지는 바깥(open)이 정하게 한다.
      // 늘 막히지는 않는다. Chrome은 Esc를 거듭 누르면(그 사이 창을 누르거나 글자를 치지 않으면) 막아도 창을 닫는다.
      // 그때는 아래 onClose가 받는다.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // 브라우저가 스스로 닫은 경우에도 바깥 상태를 맞춘다.
      // close 이벤트는 닫힌 뒤 조금 늦게 온다. 그사이 다시 열렸으면(dialog.open) 지난 닫힘이므로 무시한다.
      onClose={() => {
        if (!open || dialogRef.current?.open) return
        onClose()
        // 바깥이 닫기를 받아들였으면 open이 false가 되어 닫힌 채로 남는다.
        // 받아들이지 않았으면(저장하는 중 등) open이 그대로라, 위 효과가 창을 다시 연다.
        // 다시 열지 않으면 창은 사라졌는데 open은 true로 남아, 안의 안내를 볼 수도 창을 다시 열 수도 없게 된다.
        setForcedCloses((count) => count + 1)
      }}
      // 배경(::backdrop)을 누르면 이벤트 대상이 dialog 자신이다. 안쪽 내용은 아래 div가 덮고 있다.
      // 창 안에서 누른 채 배경으로 끌어 놓은 경우(글자 드래그 등)는 닫지 않도록, 누르기 시작한 곳도 확인한다.
      // 반대로 배경에서 누른 채 창 안으로 끌어 놓으면 닫힌다.
      onMouseDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        const pressed = pressedOnBackdrop.current
        pressedOnBackdrop.current = false
        if (closeOnBackdrop && pressed && event.target === event.currentTarget) onClose()
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
