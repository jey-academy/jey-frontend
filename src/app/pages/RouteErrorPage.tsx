import { Button, ButtonLink, EmptyState } from '@/shared/ui'

/**
 * 화면을 그리다 에러가 났을 때 그 화면 자리에 대신 보여준다 (라우트의 `ErrorBoundary`).
 * 에러 내용은 화면에 보여주지 않는다. 콘솔에 무엇을 남길지는 `errorLogging.ts`에서 정한다.
 * 없는 주소는 여기로 오지 않는다. 라우터의 `*` 라우트가 NotFoundPage로 보낸다.
 */
export function RouteErrorPage() {
  return (
    <EmptyState
      headingLevel={1}
      title="화면을 불러오지 못했어요"
      description="잠시 후 다시 시도해 주세요. 계속 안 되면 학원 담당자에게 알려 주세요."
    >
      {/* 화면 상태가 깨졌을 수 있으므로 둘 다 페이지를 새로 불러온다. */}
      <Button onClick={() => window.location.reload()}>다시 시도</Button>
      <ButtonLink to="/" reloadDocument variant="ghost">
        처음으로
      </ButtonLink>
    </EmptyState>
  )
}
