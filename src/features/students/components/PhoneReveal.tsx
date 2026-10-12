import { useState } from 'react'
import { ApiError, retryAfterPhrase } from '@/shared/api'
import { Button } from '@/shared/ui'
import { useRevealPhone } from '../api'

type PhoneRevealProps = {
  /** 서버가 가운데를 가려서 준 번호. 누르기 전과 가린 뒤에 보여준다. */
  masked: string
  studentId: number
  /** 주면 그 학부모의 번호, 주지 않으면 학생 본인의 번호를 본다. */
  guardianId?: number
  /** 누구의 번호인지. 버튼 이름에 붙인다(예: "이영희 번호 보기"). */
  owner: string
}

function revealErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '번호를 보지 못했어요. 잠시 후 다시 시도해 주세요.'
  if (error.status === 429) {
    return `번호 보기를 너무 많이 했어요. ${retryAfterPhrase(error)}에 다시 시도해 주세요.`
  }
  if (error.code === 'MEMBER_PHONE_NOT_FOUND') return '지워진 번호예요.'
  if (error.code === 'MEMBER_GUARDIAN_NOT_FOUND') return '이미 연결이 끊긴 학부모예요.'
  return error.message
}

/**
 * 전화번호 한 개와 "번호 보기" 버튼. 누르면 서버에서 전체 번호를 받아 그 자리에 보여준다.
 * 누를 때마다 서버에 기록이 남고 횟수에 들므로, 눌렀을 때만 부르고 실패해도 다시 보내지 않는다.
 * 전체 번호는 이 컴포넌트의 state에만 둔다. 가리거나 화면을 떠나면 버리고, 다시 보려면 다시 눌러야 한다.
 * 줄 안에 나란히 놓이도록 조각으로 그린다. 실패 안내는 줄 아래로 내려간다(부모가 flex-wrap이어야 한다).
 */
export function PhoneReveal({ masked, studentId, guardianId, owner }: PhoneRevealProps) {
  const reveal = useRevealPhone(studentId, guardianId)
  const [full, setFull] = useState<string | null>(null)

  function show() {
    reveal.mutate(undefined, {
      onSuccess: ({ phone }) => {
        setFull(phone)
        // 응답이 mutation에 남지 않게 바로 비운다.
        reveal.reset()
      },
    })
  }

  return (
    <>
      <span className="tabular-nums">{full ?? masked}</span>
      {full === null ? (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${owner} 번호 보기`}
          onClick={show}
          disabled={reveal.isPending}
        >
          {reveal.isPending ? '보는 중' : '번호 보기'}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${owner} 번호 가리기`}
          onClick={() => setFull(null)}
        >
          가리기
        </Button>
      )}
      {reveal.isError && (
        <span role="alert" className="order-last basis-full text-[14px] text-pill-expired">
          {revealErrorMessage(reveal.error)}
        </span>
      )}
    </>
  )
}
