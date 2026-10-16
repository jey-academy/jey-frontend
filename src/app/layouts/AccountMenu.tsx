import { useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { cn } from '@/shared/lib'
import { Button, ButtonLink } from '@/shared/ui'

type AccountMenuProps = {
  /** 로그인한 사람의 이름. 아직 모르면 없다. */
  name: string | undefined
  onLogout: () => void
  loggingOut: boolean
}

// 좁은 화면(560px 이하)에서만 적용되는 모양. 넓은 화면에서는 이 묶음이 상단 바 안에 나란히 놓인다.
const panelOnMobile =
  'max-[560px]:absolute max-[560px]:top-[calc(100%+8px)] max-[560px]:right-0 max-[560px]:z-10 ' +
  'max-[560px]:w-48 max-[560px]:flex-col max-[560px]:items-stretch max-[560px]:gap-1 ' +
  'max-[560px]:rounded-md max-[560px]:border max-[560px]:border-line max-[560px]:bg-card max-[560px]:p-2 max-[560px]:shadow-float'

/**
 * 상단 바 오른쪽의 내 계정 묶음(이름, 비밀번호 변경, 로그아웃).
 * 넓은 화면에서는 셋을 나란히 보여 준다. 좁은 화면에서는 이름 버튼 하나만 보이고, 누르면 아래로 펼친다.
 * 같은 요소를 CSS로만 바꿔 보여 준다(버튼이 두 벌 생기지 않는다).
 * 펼친 묶음은 바깥을 누르거나 Esc를 누르거나 다른 화면으로 옮기면 닫힌다. Esc로 닫으면 포커스를 이름 버튼으로 돌려준다.
 */
export function AccountMenu({ name, onLogout, loggingOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const location = useLocation()

  // 다른 화면으로 옮기면(비밀번호 변경을 눌렀을 때 포함) 닫는다.
  // 렌더 도중에 맞추는 방식이다(React의 "값이 바뀔 때 state 맞추기"). 옛 화면에서 한 번 열린 채 보이지 않는다.
  const [openedAt, setOpenedAt] = useState(location.key)
  if (openedAt !== location.key) {
    setOpenedAt(location.key)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      toggle.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={root} className="relative ml-auto flex shrink-0 items-center">
      <button
        ref={toggle}
        type="button"
        // 보이는 글자는 이름뿐이다. 무엇을 여는 버튼인지 화면 낭독기에 알린다.
        aria-label={name ? `${name} 계정 메뉴` : '계정 메뉴'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((before) => !before)}
        className={cn(
          'relative inline-flex h-[38px] max-w-[9em] cursor-pointer items-center gap-1 rounded-btn-sm bg-field px-3 text-[14px] font-bold text-ink',
          "after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-['']",
          'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus',
          'min-[561px]:hidden',
        )}
      >
        <span className="truncate">{name}</span>
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>

      <div
        id={panelId}
        className={cn('flex items-center gap-3', panelOnMobile, !open && 'max-[560px]:hidden')}
      >
        {name && (
          <span className="text-[14px] font-semibold whitespace-nowrap text-sub max-[560px]:hidden">
            {name}
          </span>
        )}
        {/* 처음 비밀번호는 관리자가 정해 건넨다. 받은 사람이 바로 찾아 바꿀 수 있게 상단 바에 둔다(좁은 화면은 이름 버튼 안). */}
        <ButtonLink to="/account/password" variant="ghost" size="sm">
          비밀번호 변경
        </ButtonLink>
        <Button variant="ghost" size="sm" onClick={onLogout} disabled={loggingOut}>
          로그아웃
        </Button>
      </div>
    </div>
  )
}
