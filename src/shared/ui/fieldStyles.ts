import { cn } from '@/shared/lib/cn'

export const fieldLabelClassName = 'mb-1.5 block text-[14px] font-semibold'

/**
 * 입력창과 선택 상자가 같이 쓰는 모양. 포커스는 테두리 색으로 표시한다.
 * outline-hidden은 평소에는 안 보이고, 색을 강제로 바꾸는 고대비 모드에서만 외곽선을 보여준다.
 */
export function fieldControlClassName(invalid: boolean, className?: string): string {
  return cn(
    'h-[50px] w-full rounded-sm border-[1.5px] bg-field px-3.5',
    'transition-[border-color,background-color] duration-150',
    'focus:border-night focus:bg-white focus:outline-hidden disabled:text-sub',
    invalid ? 'border-red' : 'border-transparent',
    className,
  )
}
