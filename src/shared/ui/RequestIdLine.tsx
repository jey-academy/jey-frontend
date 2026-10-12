type RequestIdLineProps = {
  /** 보여줄 요청 번호. 없으면 아무것도 그리지 않는다. */
  requestId: string | null | undefined
}

/**
 * 오류 안내 아래에 붙는 한 줄: "문의할 때 이 번호를 알려 주세요: (요청 번호)". 이 번호로 서버 로그에서 그 요청을 찾는다.
 * 받은 값은 거르지 않고 그린다. 어떤 오류에 보여줄지는 부르는 쪽이 `supportRequestId`로 정해서 넘긴다.
 * 문단(p)이나 줄 안(span)의 안내에도 넣을 수 있게 span으로 그리고 줄을 바꾼다.
 */
export function RequestIdLine({ requestId }: RequestIdLineProps) {
  if (!requestId) return null
  return (
    <span className="mt-1.5 block text-[13px] font-normal">
      문의할 때 이 번호를 알려 주세요:{' '}
      {/* 번호가 길어도(64자) 좁은 화면에서 넘치지 않게 글자 단위로 줄을 바꾼다. 눌러서 통째로 고를 수 있다. */}
      <span className="break-all tabular-nums select-all">{requestId}</span>
    </span>
  )
}
