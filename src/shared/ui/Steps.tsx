import { cn } from '@/shared/lib/cn'

type StepsProps = {
  /** 순서대로 보여줄 단계. 제목은 서로 달라야 한다. */
  items: { title: string; description?: string }[]
  className?: string
}

/** 번호를 매긴 사용 안내 (예: 학부모 패스의 "이렇게 사용해요"). */
export function Steps({ items, className }: StepsProps) {
  return (
    <ol className={cn('grid gap-3.5', className)}>
      {items.map((item, index) => (
        <li key={item.title} className="grid grid-cols-[28px_1fr] items-start gap-3 text-[15px]">
          {/* 목록(ol)이 몇 번째인지 이미 알려 주므로 숫자 원은 장식이다. */}
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-full bg-night text-[13px] font-bold text-white"
          >
            {index + 1}
          </span>
          <div>
            <b className="block font-semibold">{item.title}</b>
            {item.description && <span className="text-[14px] text-sub">{item.description}</span>}
          </div>
        </li>
      ))}
    </ol>
  )
}
