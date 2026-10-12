import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { supportRequestId } from '@/shared/api'
import { canAccess, homePathOf, useLogin, useMe } from '@/shared/auth'
import { Button, Card, Logo, Notice, TextField } from '@/shared/ui'

/** 로그인 화면으로 오기 전에 가려던 주소. 앱 안의 주소가 아니면 쓰지 않는다. */
function readFrom(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('from' in state)) return null
  const { from } = state
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return null
  return from
}

/** 직원·관리자·연계 학원 로그인. 학부모는 로그인 없이 링크로 패스를 연다. */
export function LoginPage() {
  const { data: me, isPending } = useMe()
  const login = useLogin()
  const location = useLocation()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')

  // 이미 로그인했거나 방금 로그인에 성공했으면 가려던 화면으로 보낸다.
  // 가려던 화면이 없거나 이 계정으로 볼 수 없는 곳이면(앞사람이 보던 화면 등) 역할의 첫 화면으로 보낸다.
  if (me) {
    const from = readFrom(location.state)
    const to = from && canAccess(me.role, from) ? from : homePathOf(me.role)
    return <Navigate to={to} replace />
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    login.mutate({ loginId, password })
  }

  return (
    <main className="mx-auto max-w-[420px] px-5 pt-[12vh] pb-12">
      <Logo label="JEY" markSize={26} className="mb-6 text-[22px]" />
      <Card>
        <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">로그인</h1>
        <p className="mt-1 text-sub">직원, 관리자, 연계 학원 계정으로 들어가요.</p>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <TextField
            label="아이디"
            name="loginId"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
          />
          <TextField
            label="비밀번호"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {login.isError && (
            <Notice requestId={supportRequestId(login.error)}>{login.error.message}</Notice>
          )}
          {/* 로그인 상태를 확인하는 동안에는 누르지 못하게 한다. 이미 로그인한 사람은 곧 다른 화면으로 넘어간다. */}
          <Button type="submit" block disabled={isPending || login.isPending}>
            {login.isPending ? '로그인하는 중' : '로그인'}
          </Button>
        </form>
      </Card>
    </main>
  )
}
