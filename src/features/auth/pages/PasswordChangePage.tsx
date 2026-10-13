import { useState, type FormEvent } from 'react'
import {
  isRateLimited,
  NO_SERVER_ERRORS,
  retryAfterPhrase,
  splitServerError,
  type FieldErrors,
  type ServerErrors,
} from '@/shared/api'
import {
  PASSWORD_RULE_HINT,
  passwordError,
  useChangeMyPassword,
  useMe,
  type PasswordChangeRequest,
} from '@/shared/auth'
import { Button, Card, Form, Notice, PasswordField } from '@/shared/ui'

// 서버가 errors[].field로 주는 이름과 같다(요청 본문의 필드 이름). 서버가 이름을 바꾸면 여기서 컴파일 에러가 난다.
const fieldNames = [
  'currentPassword',
  'newPassword',
] as const satisfies readonly (keyof PasswordChangeRequest)[]
type FieldName = (typeof fieldNames)[number]

// 필드 목록 없이 코드로만 오는 에러가 어느 칸의 문제인지.
const codeFields: Record<string, FieldName> = {
  AUTH_CURRENT_PASSWORD_MISMATCH: 'currentPassword',
  AUTH_PASSWORD_UNCHANGED: 'newPassword',
  AUTH_PASSWORD_NOT_ACCEPTABLE: 'newPassword',
}

// 바뀌었는데 응답만 놓쳤다면, 이 브라우저는 새 세션 쿠키를 받지 못해 다음 요청에서 로그아웃된다.
// 그때 옛 비밀번호로 로그인하려다 막히지 않게 미리 알린다.
const UNSURE = '바뀌었을 수도 있어요. 다시 로그인하라고 나오면 새 비밀번호로 먼저 로그인해 보세요.'

function serverErrors(error: unknown): ServerErrors<FieldName> {
  // 지금 비밀번호를 여러 번 틀려 잠겼다(429). 입력이 틀린 것이 아니라 기다려야 풀린다.
  if (isRateLimited(error)) {
    return {
      ...NO_SERVER_ERRORS,
      form: `지금 비밀번호를 여러 번 틀렸어요. ${retryAfterPhrase(error)}에 다시 시도해 주세요. 그동안은 맞는 비밀번호로도 바꿀 수 없어요.`,
    }
  }
  return splitServerError(error, { fields: fieldNames, codes: codeFields, unsure: UNSURE })
}

/**
 * 내 비밀번호 변경. 로그인한 누구나 쓴다. 처음 비밀번호는 관리자가 정해 건네므로, 받은 사람이 여기서 바로 바꾼다.
 * 바꾼 뒤에도 이 브라우저는 로그인된 채로 남는다. 로그인 화면으로 보내지 않는다.
 * 입력한 비밀번호는 이 화면의 state와 요청 본문 밖으로 내보내지 않는다.
 */
export function PasswordChangePage() {
  const { data: me } = useMe()
  const change = useChangeMyPassword()
  // 요청과 화면이 같은 컴포넌트에 있어 저장 중인지는 요청의 상태로 본다.
  const saving = change.isPending

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  // 보내기 전에 걸러 낸 오류. 서버가 준 오류는 change.error에서 읽는다.
  const [localErrors, setLocalErrors] = useState<FieldErrors<FieldName>>({})
  // 방금 바꿨다는 안내. 다시 내면 지운다.
  const [changed, setChanged] = useState(false)
  // 바꿀 때마다 올린다. 두 칸을 새로 만들어 "보기"로 열어 둔 상태까지 되돌린다.
  // 값만 비우면 칸이 열린 채로 남아, 이어서 치는 비밀번호가 그대로 보인다.
  const [round, setRound] = useState(0)

  const server = change.isError ? serverErrors(change.error) : NO_SERVER_ERRORS
  const errors: FieldErrors<FieldName> = { ...server.fields, ...localErrors }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setChanged(false)
    // 문제가 없는 칸은 키를 넣지 않는다. undefined로 넣어도 키로 세어져 아래에서 보내지 않게 된다.
    const nextErrors: FieldErrors<FieldName> = {}
    if (currentPassword === '') nextErrors.currentPassword = '지금 비밀번호를 입력해 주세요.'
    const invalid = passwordError(newPassword, me?.loginId ?? '')
    if (invalid) nextErrors.newPassword = invalid
    // 서버도 거부한다(AUTH_PASSWORD_UNCHANGED). 지금 비밀번호를 틀린 횟수에 들지 않게 보내기 전에 막는다.
    else if (newPassword === currentPassword) {
      nextErrors.newPassword = '지금 비밀번호와 다른 비밀번호를 입력해 주세요.'
    }
    setLocalErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      // 보내지 않았으니 지난번 서버 오류는 지금 입력에 대한 것이 아니다.
      change.reset()
      return
    }

    try {
      await change.mutateAsync({ currentPassword, newPassword })
    } catch {
      // 요청의 실패는 change.error로 화면에 보여준다. 고쳐서 다시 낼 수 있게 입력은 그대로 둔다.
      return
    }
    // 끝났으니 입력한 비밀번호를 화면과 요청 기록에서 지운다.
    setCurrentPassword('')
    setNewPassword('')
    change.reset()
    setRound((now) => now + 1)
    setChanged(true)
  }

  return (
    <div className="mx-auto max-w-[420px]">
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">비밀번호 변경</h1>
      {me && (
        <p className="mt-1 text-sub">{`${me.name}(${me.loginId}) 계정의 비밀번호를 바꿔요.`}</p>
      )}
      <Card className="mt-6">
        <Form saving={saving} onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
          {/* 비밀번호 관리 프로그램이 어느 계정의 비밀번호인지 알게 한다. 화면에는 보이지 않는다. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={me?.loginId ?? ''}
            readOnly
            hidden
          />
          <PasswordField
            key={`current-${round}`}
            label="지금 비밀번호"
            name="currentPassword"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            error={errors.currentPassword}
          />
          <PasswordField
            key={`new-${round}`}
            label="새 비밀번호"
            name="newPassword"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            hint={PASSWORD_RULE_HINT}
            error={errors.newPassword}
          />
          {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}
          {changed && (
            <Notice tone="success">
              비밀번호를 바꿨어요. 이 계정으로 로그인된 다른 기기는 로그아웃됐어요.
            </Notice>
          )}
          <Button type="submit" block>
            {saving ? '바꾸는 중' : '비밀번호 바꾸기'}
          </Button>
        </Form>
      </Card>
    </div>
  )
}
