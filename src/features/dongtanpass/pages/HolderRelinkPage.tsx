import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, retryAfterPhrase, splitServerError, type FieldErrors } from '@/shared/api'
import { isMobilePhone } from '@/shared/lib'
import { Button, Form, Notice, TextField } from '@/shared/ui'
import { useRelinkHolderPass } from '../api'

const FIELDS = ['studentName', 'guardianPhone'] as const
type Field = (typeof FIELDS)[number]

/** 학부모 패스 화면이 "방금 다시 받았다"를 알아보는 표시. 이름과 번호는 넘기지 않는다. */
export type RelinkedState = { relinked: true }

/** 응답을 놓쳤을 때. 서버에서는 새 링크가 만들어졌을 수 있다. 다시 받으면 또 새 링크다. */
const UNSURE =
  '새 링크가 만들어졌을 수도 있어요. 다시 누르면 새 링크를 한 번 더 받아요(앞의 링크는 열리지 않아요).'

/**
 * 링크를 잃어버린 학부모가 학생 이름과 전체 번호로 새 링크를 받는다(`/find`). 받으면 새 링크의 패스 화면으로 간다.
 * 번호는 이 폼과 요청 본문에만 있다. 주소·화면 이동 상태·콘솔에 남기지 않는다.
 */
export function HolderRelinkPage() {
  const navigate = useNavigate()
  const relink = useRelinkHolderPass()
  const [input, setInput] = useState({ studentName: '', guardianPhone: '' })
  const [localErrors, setLocalErrors] = useState<FieldErrors<Field>>({})
  const saving = relink.isPending

  const server = relink.error ? messageOf(relink.error) : null
  const errors: FieldErrors<Field> = { ...server?.fields, ...localErrors }

  function change(field: Field, value: string) {
    setInput((current) => ({ ...current, [field]: value }))
    setLocalErrors((current) => ({ ...current, [field]: undefined }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const studentName = input.studentName.trim()
    const guardianPhone = input.guardianPhone.trim()
    const next: FieldErrors<Field> = {}
    if (!studentName) next.studentName = '학생 이름을 적어 주세요.'
    if (!guardianPhone) next.guardianPhone = '학부모 휴대전화 번호를 적어 주세요.'
    else if (!isMobilePhone(guardianPhone)) next.guardianPhone = '휴대전화 번호 형식이 맞지 않아요.'
    setLocalErrors(next)
    if (next.studentName || next.guardianPhone) return

    relink.mutate(
      { studentName, guardianPhone },
      {
        onSuccess: ({ linkToken }) => {
          const state: RelinkedState = { relinked: true }
          void navigate(`/p/${encodeURIComponent(linkToken)}`, { state })
        },
      },
    )
  }

  return (
    <section className="rounded-lg bg-card px-[22px] py-7">
      <h1 className="text-[26px] font-bold tracking-[-0.04em]">링크 다시 받기</h1>
      <p className="mt-1.5 mb-[22px] text-sub">
        패스를 받을 때 알려 준 학생 이름과 학부모 휴대전화 번호를 적어 주세요.
      </p>
      <Form saving={saving} onSubmit={handleSubmit} className="grid gap-3.5">
        <TextField
          label="학생 이름"
          value={input.studentName}
          onChange={(event) => change('studentName', event.target.value)}
          error={errors.studentName}
          autoComplete="off"
        />
        <TextField
          label="학부모 휴대전화"
          value={input.guardianPhone}
          onChange={(event) => change('guardianPhone', event.target.value)}
          placeholder="010-1234-5678"
          inputMode="tel"
          autoComplete="tel"
          error={errors.guardianPhone}
        />
        <Notice tone="warning">
          새 링크를 받으면 예전 링크는 열리지 않아요. 링크를 같이 쓰는 가족에게 새 링크를 보내
          주세요.
        </Notice>
        {server?.form && <Notice requestId={server.requestId}>{server.form}</Notice>}
        <Button type="submit" block>
          {saving ? '받는 중' : '링크 다시 받기'}
        </Button>
      </Form>
    </section>
  )
}

/** 서버의 답을 안내로 바꾼다. 맞지 않음·쓸 수 없는 패스·잠시 막힘은 이 화면의 문구로, 나머지는 공통 규칙으로. */
function messageOf(error: unknown) {
  if (error instanceof ApiError) {
    // 이름과 번호 중 어느 쪽이 틀렸는지는 서버도 알려 주지 않는다(일부러).
    if (error.status === 404) {
      return {
        fields: {},
        form: '이름이나 번호가 맞지 않아요. 패스를 받을 때 알려 준 번호인지 확인해 주세요.',
        requestId: null,
      }
    }
    // 이름과 번호는 맞았지만 쓸 수 있는 패스가 없다(사용함·기간 지남·발급 취소). 서버가 사정을 알려 준다.
    if (error.status === 409) {
      return {
        fields: {},
        form: `${error.message} 패스를 발급한 학원에 문의해 주세요.`,
        requestId: null,
      }
    }
    // 같은 접속 주소에서 여러 번 틀렸다. 같은 와이파이의 다른 사람 때문일 수도 있다.
    if (error.status === 429) {
      return {
        fields: {},
        form: `여러 번 맞지 않아 잠시 막혔어요. ${retryAfterPhrase(error)}에 다시 해 주세요. 같은 와이파이를 쓰는 다른 사람 때문일 수도 있어요.`,
        requestId: null,
      }
    }
  }
  return splitServerError(error, { fields: FIELDS, unsure: UNSURE })
}
