import { useState, type FormEvent } from 'react'
import { NO_SERVER_ERRORS, splitServerError, type FieldErrors } from '@/shared/api'
import { PASSWORD_RULE_HINT, passwordError } from '@/shared/auth'
import { Button, Form, Modal, Notice, PasswordField, useSaving, type RunSaving } from '@/shared/ui'
import { UNSURE_RETRY, useResetAccountPassword, type Account } from '../api'

type PasswordResetModalProps = {
  onClose: () => void
  /** 비밀번호를 다시 정할 계정. 없으면 창이 닫혀 있다. */
  account: Account | null
  /** 저장에 성공했을 때. 화면에 남길 안내 문구를 넘긴다. */
  onDone: (message: string) => void
}

/**
 * 다른 계정의 비밀번호를 다시 정하는 창. 비밀번호를 잊은 직원에게 관리자가 새로 정해 준다.
 * 닫히면 안의 폼이 사라지므로 입력한 비밀번호도 함께 사라진다.
 */
export function PasswordResetModal({ onClose, account, onDone }: PasswordResetModalProps) {
  // 저장하는 동안에는 닫지 못하게 한다(closable). 닫아 버리면 실패했을 때 안내를 볼 곳이 없어진다.
  const [saving, runSaving] = useSaving()

  return (
    <Modal
      open={account !== null}
      onClose={onClose}
      closable={!saving}
      title="비밀번호 다시 정하기"
      description={
        account
          ? `${account.name}(${account.loginId}) 계정의 비밀번호를 새로 정해요. 저장하면 그 계정은 바로 로그아웃돼요.`
          : undefined
      }
      closeOnBackdrop={false}
      className="max-w-[460px]"
    >
      {account && (
        <PasswordResetForm
          key={account.id}
          onClose={onClose}
          account={account}
          onDone={onDone}
          saving={saving}
          runSaving={runSaving}
        />
      )}
    </Modal>
  )
}

type FieldName = 'password'
const fieldNames: FieldName[] = ['password']
const codeFields = { AUTH_PASSWORD_NOT_ACCEPTABLE: 'password' } as const

type PasswordResetFormProps = {
  onClose: () => void
  account: Account
  onDone: (message: string) => void
  saving: boolean
  /** 저장을 맡긴다. 맡긴 일이 끝나면 `saving`이 풀린다(useSaving). */
  runSaving: RunSaving
}

function PasswordResetForm({
  onClose,
  account,
  onDone,
  saving,
  runSaving,
}: PasswordResetFormProps) {
  const reset = useResetAccountPassword()
  // 비밀번호 원문. 이 폼의 state와 요청 본문 밖으로 내보내지 않는다.
  const [password, setPassword] = useState('')
  const [localErrors, setLocalErrors] = useState<FieldErrors<FieldName>>({})

  const server = reset.isError
    ? splitServerError(reset.error, {
        fields: fieldNames,
        codes: codeFields,
        unsure: UNSURE_RETRY,
      })
    : NO_SERVER_ERRORS
  const errors: FieldErrors<FieldName> = { ...server.fields, ...localErrors }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalid = passwordError(password, account.loginId)
    setLocalErrors(invalid ? { password: invalid } : {})
    if (invalid) {
      // 보내지 않았으니 지난번 서버 오류는 지금 입력에 대한 것이 아니다.
      reset.reset()
      return
    }

    void runSaving(async () => {
      try {
        await reset.mutateAsync({ id: account.id, password })
      } catch {
        // 요청의 실패는 reset.error로 화면에 보여준다.
        return
      }
      onDone(
        `${account.loginId} 계정의 비밀번호를 다시 정했어요. 새 비밀번호를 직접 전하고, 로그인한 뒤 바꾸게 안내해 주세요.`,
      )
      onClose()
    })
  }

  return (
    <Form saving={saving} onSubmit={handleSubmit} className="mt-5 grid gap-4 text-left">
      <PasswordField
        label="새 비밀번호"
        name="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        // 저장된 (관리자 자신의) 비밀번호를 채워 넣지 말라고 브라우저에 알린다.
        autoComplete="new-password"
        hint={PASSWORD_RULE_HINT}
        error={errors.password}
      />
      {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button type="submit">{saving ? '저장하는 중' : '저장'}</Button>
      </div>
    </Form>
  )
}
