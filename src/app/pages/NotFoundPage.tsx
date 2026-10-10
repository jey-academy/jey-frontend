import { ButtonLink, EmptyState } from '@/shared/ui'

/** 없는 주소로 들어왔을 때. */
export function NotFoundPage() {
  return (
    <EmptyState
      headingLevel={1}
      title="찾는 화면이 없어요"
      description="주소가 바뀌었거나 잘못 입력됐을 수 있어요."
    >
      <ButtonLink to="/">처음으로</ButtonLink>
    </EmptyState>
  )
}
