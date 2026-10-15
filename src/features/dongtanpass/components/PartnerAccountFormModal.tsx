import { useState, type FormEvent } from 'react'
import {
  ApiError,
  isOutcomeUnknown,
  NO_SERVER_ERRORS,
  splitServerError,
  type FieldErrors,
} from '@/shared/api'
import {
  LOGIN_ID_MAX_LENGTH,
  LOGIN_ID_RULE_HINT,
  loginIdError,
  PASSWORD_RULE_HINT,
  passwordError,
} from '@/shared/auth'
import type { Partner } from '@/shared/partner'
import {
  Button,
  Form,
  Modal,
  Notice,
  PasswordField,
  TextField,
  useSaving,
  type SavingProps,
} from '@/shared/ui'
import { useCreatePartnerAccount, type PartnerAccountCreateRequest } from '../api'

type PartnerAccountFormModalProps = {
  onClose: () => void
  /** 계정을 만들 학원. 없으면 창이 닫혀 있다. 창을 열 때의 값이다. */
  partner: Pick<Partner, 'id' | 'name'> | null
  /** 만드는 데 성공했을 때. 화면에 남길 안내 문구를 넘긴다. */
  onDone: (message: string) => void
}

/** 연계 학원의 공용 계정 만들기 창. 닫히면 안의 폼(비밀번호 포함)이 사라진다. */
export function PartnerAccountFormModal({
  onClose,
  partner,
  onDone,
}: PartnerAccountFormModalProps) {
  // 만드는 동안에는 닫지 못하게 한다(closable). 닫아도 요청은 끝까지 가므로, 실패했을 때 안내를 볼 곳이 없어진다.
  const [saving, runSaving] = useSaving()

  return (
    <Modal
      open={partner !== null}
      onClose={onClose}
      closable={!saving}
      title="연계 학원 계정 만들기"
      description={
        partner
          ? `${partner.name}에서 같이 쓰는 계정이에요. 소속은 만든 뒤 바꿀 수 없어요.`
          : undefined
      }
      // 입력하던 내용이 실수로 사라지지 않게 배경을 눌러도 닫지 않는다.
      closeOnBackdrop={false}
      className="max-w-[460px]"
    >
      {partner && (
        <PartnerAccountForm
          // 학원이 바뀌면 폼을 새로 만든다. 앞 학원에 쓰던 값(비밀번호 포함)이 남지 않게 한다.
          key={partner.id}
          partner={partner}
          onClose={onClose}
          onDone={onDone}
          saving={saving}
          runSaving={runSaving}
        />
      )}
    </Modal>
  )
}

// 서버가 errors[].field로 주는 이름과 같다(요청 본문의 필드 이름). 서버가 이름을 바꾸면 여기서 컴파일 에러가 난다.
const fieldNames = [
  'loginId',
  'name',
  'password',
] as const satisfies readonly (keyof PartnerAccountCreateRequest)[]
type FieldName = (typeof fieldNames)[number]

// 필드 목록 없이 코드로만 오는 에러가 어느 칸의 문제인지.
const codeFields: Record<string, FieldName> = {
  AUTH_LOGIN_ID_DUPLICATED: 'loginId',
  AUTH_PASSWORD_NOT_ACCEPTABLE: 'password',
}
// 그 사이 학원이 꺼졌다. 화면의 학원 목록은 다시 받는다(useCreatePartnerAccount).
const PARTNER_INACTIVE = 'DONGTANPASS_PARTNER_INACTIVE_FOR_ACCOUNT'
const LOGIN_ID_HINT = `${LOGIN_ID_RULE_HINT} 예: sunshine.math`
// 서버가 받는 이름의 최대 길이
const NAME_MAX_LENGTH = 50

type PartnerAccountFormProps = {
  partner: Pick<Partner, 'id' | 'name'>
  onClose: () => void
  onDone: (message: string) => void
} & SavingProps

function PartnerAccountForm({
  partner,
  onClose,
  onDone,
  saving,
  runSaving,
}: PartnerAccountFormProps) {
  const create = useCreatePartnerAccount()
  const [loginId, setLoginId] = useState('')
  const [name, setName] = useState('')
  // 비밀번호 원문. 이 폼의 state와 요청 본문 밖으로 내보내지 않는다.
  const [password, setPassword] = useState('')
  const [localErrors, setLocalErrors] = useState<FieldErrors<FieldName>>({})
  // 만들기 요청을 보냈는데 만들어졌는지 알 수 없게 끝난(응답 없음, 서버 오류) 아이디.
  const [unsureLoginId, setUnsureLoginId] = useState<string | null>(null)

  const inactive = create.error instanceof ApiError && create.error.code === PARTNER_INACTIVE
  const server = create.isError
    ? splitServerError(create.error, {
        fields: fieldNames,
        codes: codeFields,
        // 멱등 키가 없다. 그대로 다시 보내면 "이미 사용 중인 아이디"가 온다. 다시 누르라고 하지 않는다.
        unsure: `만들어졌을 수도 있어요. 다시 만들기 전에, 계정 관리에서 ${unsureLoginId ?? '그'} 계정이 있는지 먼저 확인해 주세요.`,
      })
    : NO_SERVER_ERRORS
  const errors: FieldErrors<FieldName> = { ...server.fields, ...localErrors }
  const formError = inactive
    ? `${partner.name} 학원이 꺼져 있어요. 학원을 먼저 켠 뒤에 계정을 만들어 주세요.`
    : server.form

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // 문제가 없는 칸은 키를 넣지 않는다. undefined로 넣으면 위에서 합칠 때 서버가 준 오류를 가린다.
    const nextErrors: FieldErrors<FieldName> = {}
    const id = loginId.trim()
    const invalidLoginId = loginIdError(id)
    if (invalidLoginId) nextErrors.loginId = invalidLoginId
    if (name.trim() === '') nextErrors.name = '이름을 입력해 주세요.'
    const invalidPassword = passwordError(password, id)
    if (invalidPassword) nextErrors.password = invalidPassword
    setLocalErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      // 보내지 않았으니 지난번 서버 오류는 지금 입력에 대한 것이 아니다.
      create.reset()
      return
    }

    void runSaving(async () => {
      try {
        await create.mutateAsync({
          partnerId: partner.id,
          body: { loginId: id, name: name.trim(), password },
        })
      } catch (error) {
        // 요청의 실패는 create.error로 폼에 보여준다. 만들어졌을 수 있으면 어느 아이디였는지 적어 둔다.
        if (isOutcomeUnknown(error)) setUnsureLoginId(id)
        return
      }
      // 서버는 처음 비밀번호를 바꾸라고 강제하지 않는다. 전하는 사람이 안내해야 한다.
      onDone(
        `${partner.name}의 ${id} 계정을 만들었어요. 처음 비밀번호를 직접 전하고, 로그인한 뒤 바꾸게 안내해 주세요.`,
      )
      onClose()
    })
  }

  return (
    <Form saving={saving} onSubmit={handleSubmit} className="mt-5 grid gap-4 text-left">
      <TextField
        label="아이디"
        name="loginId"
        value={loginId}
        // 아이디는 소문자만 받는다. 대문자로 쳐도 소문자로 바꿔 준다.
        onChange={(event) => setLoginId(event.target.value.toLowerCase())}
        maxLength={LOGIN_ID_MAX_LENGTH}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        hint={LOGIN_ID_HINT}
        error={errors.loginId}
      />
      <TextField
        label="이름"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={NAME_MAX_LENGTH}
        autoComplete="off"
        hint="화면에 보일 이름이에요. 예: 햇살수학 데스크"
        error={errors.name}
      />
      <PasswordField
        label="처음 비밀번호"
        name="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        // 저장된 (관리자 자신의) 비밀번호를 채워 넣지 말라고 브라우저에 알린다.
        autoComplete="new-password"
        hint={PASSWORD_RULE_HINT}
        error={errors.password}
      />
      {formError && <Notice requestId={server.requestId}>{formError}</Notice>}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button type="submit">{saving ? '만드는 중' : '만들기'}</Button>
      </div>
    </Form>
  )
}
