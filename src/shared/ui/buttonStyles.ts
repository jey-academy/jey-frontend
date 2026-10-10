import { cn } from '@/shared/lib/cn'

export type ButtonStyleProps = {
  variant?: 'primary' | 'ghost'
  size?: 'md' | 'sm'
  /** 가로를 꽉 채운다. md 크기에서는 높이도 58px로 커진다. */
  block?: boolean
}

const base =
  'relative inline-grid cursor-pointer place-items-center border-0 font-bold no-underline ' +
  '[transition:scale_.08s,background-color_.15s] active:scale-98 ' +
  'disabled:cursor-default disabled:scale-100'

const variants = {
  primary: 'bg-night text-white hover:bg-night-2 disabled:bg-disabled',
  ghost: 'bg-field text-ink hover:bg-line disabled:bg-field',
}

// sm은 보이는 높이가 38px이라 ::after로 위아래 3px씩 넓혀 터치 영역 44px을 맞춘다.
const sizes = {
  md: 'h-[52px] rounded-btn px-6 text-[16px]',
  sm: "h-[38px] min-w-11 rounded-btn-sm px-3.5 text-[14px] after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-['']",
}

/** 버튼 모양의 클래스. `Button`(button 태그)과 `ButtonLink`(링크)가 같이 쓴다. */
export function buttonClassName(
  { variant = 'primary', size = 'md', block = false }: ButtonStyleProps,
  className?: string,
): string {
  return cn(
    base,
    variants[variant],
    sizes[size],
    block && 'w-full',
    block && size === 'md' && 'h-[58px] text-[17px]',
    className,
  )
}
