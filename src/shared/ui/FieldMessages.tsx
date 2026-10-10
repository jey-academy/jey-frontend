type FieldMessagesProps = {
  hintId: string
  errorId: string
  hint?: string
  error?: string
}

/** 입력창 아래의 안내 문구와 에러 문구. 에러가 있으면 안내 문구 대신 에러를 보여준다. */
export function FieldMessages({ hintId, errorId, hint, error }: FieldMessagesProps) {
  if (error) {
    return (
      <p id={errorId} className="mt-1.5 text-[13px] font-semibold text-pill-expired">
        {error}
      </p>
    )
  }
  if (hint) {
    return (
      <p id={hintId} className="mt-1.5 text-[13px] text-sub">
        {hint}
      </p>
    )
  }
  return null
}
