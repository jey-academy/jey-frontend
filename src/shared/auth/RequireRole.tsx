import { Navigate, Outlet, useLocation } from 'react-router'
import { ApiError, supportRequestId } from '@/shared/api'
import { Button, ButtonLink, EmptyState, RequestIdLine } from '@/shared/ui'
import { useMe, type Role } from './api'
import { homePathOf } from './roles'

type RequireRoleProps = {
  /** 이 안의 화면을 볼 수 있는 역할 */
  roles: Role[]
}

/**
 * 라우트를 감싸는 가드. 로그인하지 않았으면 로그인 화면으로 보내고, 역할이 맞지 않으면 안내를 보여준다.
 * 통과하면 안쪽 화면(`Outlet`)을 그린다.
 */
export function RequireRole({ roles }: RequireRoleProps) {
  const { data: me, isPending, isError, error, refetch } = useMe()
  const location = useLocation()

  // 누구인지 확인하는 동안에는 아무것도 보여주지 않는다. 보호된 화면이 잠깐 비쳤다 사라지는 것을 막는다.
  if (isPending) {
    return (
      <p role="status" className="px-3 py-24 text-center text-sub">
        로그인 상태를 확인하고 있어요.
      </p>
    )
  }

  // 한 번도 확인하지 못했을 때만 막는다. 이미 로그인해 쓰는 중에 다시 확인하다 실패한 것(잠깐의 연결 끊김 등)으로는
  // 보던 화면을 치우지 않는다. 세션이 정말 끊겼다면 401이 와서 아래의 로그인 화면으로 간다.
  if (isError && me === undefined) {
    return (
      <EmptyState
        headingLevel={1}
        title="로그인 상태를 확인하지 못했어요"
        description={
          <>
            {error instanceof ApiError ? error.message : '잠시 후 다시 시도해 주세요.'}
            {/* 앱에 들어가지 못하는 상황이다. 서버 쪽 문제면 문의할 때 쓸 번호를 함께 보여준다. */}
            <RequestIdLine requestId={supportRequestId(error)} />
          </>
        }
      >
        <Button onClick={() => refetch()}>다시 시도</Button>
      </EmptyState>
    )
  }

  if (!me) {
    // 로그인한 뒤 원래 가려던 화면으로 돌아오도록 주소를 넘긴다.
    const from = `${location.pathname}${location.search}`
    return <Navigate to="/login" replace state={{ from }} />
  }

  if (!roles.includes(me.role)) {
    return (
      <EmptyState
        headingLevel={1}
        title="이 화면을 볼 권한이 없어요"
        description="다른 계정으로 봐야 한다면 로그아웃한 뒤 다시 로그인해 주세요."
      >
        <ButtonLink to={homePathOf(me.role)}>내 화면으로</ButtonLink>
      </EmptyState>
    )
  }

  return <Outlet />
}
