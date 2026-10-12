import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type ModalProps = {
  /** 열려 있는지. 바깥에서 관리한다. */
  open: boolean
  /**
   * 닫아 달라는 요청(Esc, 배경 클릭). 닫으려면 이 안에서 바로 open을 false로 바꾼다.
   * 닫으면 안 되는 동안(저장하는 중 등)은 무시해도 된다. 무시했는데 브라우저가 창을 닫아 버리면 Modal이 다시 연다.
   * 무시하는 동안에는 창을 닫을 길이 없다. 요청이 끝날 때까지만 무시한다.
   * Esc 한 번에 두 번 불릴 수 있다. 여러 번 불려도 결과가 같게 쓴다.
   */
  onClose: () => void
  title: string
  description?: string
  /** 어두운 배경을 눌렀을 때 닫을지. 실수로 닫히면 곤란한 창(QR 스캔 등)에서는 끈다. */
  closeOnBackdrop?: boolean
  /** 창 안에 넣을 내용. 닫을 방법(닫기 버튼)을 반드시 포함한다. 닫기를 잠시 막는 동안에는 그 버튼도 막는다. 창이 닫혀 있는 동안에는 그려지지 않는다. */
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
  // 창 안에서 마지막으로 포커스가 있던 곳. 브라우저가 닫은 창을 다시 열 때 그 자리로 돌려놓는다.
  // 바깥이 닫았다 새로 여는 창에서는 쓰이지 않는다. 안의 내용이 새로 그려져, 적어 둔 요소가 창 안에 없다.
  const lastFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      // showModal은 포커스를 창의 첫 칸으로 옮긴다. 그 전에 있던 자리를 먼저 꺼내 둔다.
      const focused = lastFocused.current
      // 바깥이 닫기를 받아들이지 않았는데(open이 그대로) 브라우저가 닫아 버린 창도 여기서 다시 열린다.
      dialog.showModal()
      // 치던 칸으로 돌려놓는다. 첫 칸(선택 상자일 수 있다)에 두면, 이어 누른 키가 그 칸의 값을 바꾼다.
      // 스크롤은 건드리지 않는다. 다시 열어도 보던 자리가 그대로다.
      if (focused && dialog.contains(focused)) focused.focus({ preventScroll: true })
    }
    if (!open && dialog.open) dialog.close()
    // 사라진 요소를 붙잡고 있지 않게 비운다.
    if (!open) lastFocused.current = null
  }, [open, forcedCloses])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Esc: 브라우저가 바로 닫지 않게 막고, 닫을지는 바깥(open)이 정하게 한다.
      // 늘 막히지는 않는다. 창을 누르거나 글자를 치지 않고 Esc만 거듭 누르면, 막아도 브라우저가 창을 닫는다.
      // 페이지가 사용자를 창에 가두지 못하게 하는 HTML 표준(close watcher)의 동작이다. Chrome에서 확인했다.
      // 그때는 cancel과 close가 모두 와서 onClose가 두 번 불리고, 다시 여는 일은 아래 onClose가 한다.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // 브라우저가 스스로 닫은 경우: 바깥에 알리고, 바깥이 닫지 않으면 창을 다시 연다.
      // close 이벤트는 닫힌 뒤 조금 늦게 온다. 그사이 다시 열렸으면(dialog.open) 지난 닫힘이므로 무시한다.
      onClose={() => {
        if (!open || dialogRef.current?.open) return
        onClose()
        // 바깥이 닫기를 받아들였으면 open이 false가 되어 닫힌 채로 남는다.
        // 받아들이지 않았으면(저장하는 중 등) open이 그대로라, 위 효과가 창을 다시 연다.
        // 다시 열지 않으면 창은 사라졌는데 open은 true로 남아, 안의 안내를 볼 수도 창을 다시 열 수도 없게 된다
        // (open이 이미 true라 여는 버튼을 눌러도 열리지 않는다).
        setForcedCloses((count) => count + 1)
      }}
      // 배경(::backdrop)을 누르면 이벤트 대상이 dialog 자신이다. 안쪽 내용은 아래 div가 덮고 있다.
      // 창 안에서 누른 채 배경으로 끌어 놓은 경우(글자 드래그 등)는 닫지 않도록, 누르기 시작한 곳도 확인한다.
      // 반대로 배경에서 누른 채 창 안으로 끌어 놓으면 닫힌다.
      // 창 안의 포커스가 옮겨질 때마다 적어 둔다(focus는 안쪽 요소에서 올라온다).
      onFocus={(event) => {
        if (event.target !== event.currentTarget) lastFocused.current = event.target
      }}
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
