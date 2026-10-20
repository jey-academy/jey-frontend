import type { Ref } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { supportRequestId } from '@/shared/api'
import { Button, CheckboxField, Notice } from '@/shared/ui'
import type { ConsentNotice } from '../api'

type ConsentSectionProps = {
  notice: UseQueryResult<ConsentNotice>
  /** 지금 보이는 문구에 동의했는지 (useNoticeConsent) */
  consented: boolean
  /** 동의한 뒤 문구가 바뀌었는지 (useNoticeConsent) */
  changed: boolean
  /** 문구가 바뀌었다는 답을 받으면 포커스를 옮길 동의 칸 (useNoticeConsent) */
  boxRef: Ref<HTMLInputElement>
  /** 동의 칸을 바꿀 때. 켜면 true다. */
  onChange: (checked: boolean) => void
  error: string | undefined
}

/** 발급 화면의 개인정보 안내와 동의 칸. 연계 학원 발급과 JEY 발급이 같이 쓴다. */
export function ConsentSection({
  notice,
  consented,
  changed,
  boxRef,
  onChange,
  error,
}: ConsentSectionProps) {
  return (
    <section aria-labelledby="consent-title" className="mt-1">
      <h3 id="consent-title" className="mb-1.5 text-[14px] font-semibold">
        개인정보 안내
      </h3>
      <ConsentNoticeText notice={notice} />
      {changed && (
        <Notice tone="warning" className="mt-3">
          안내 문구가 바뀌었어요. 바뀐 문구를 학부모에게 다시 알리고 확인해 주세요.
        </Notice>
      )}
      <CheckboxField
        ref={boxRef}
        label="학부모에게 알리고 동의를 받았어요"
        checked={consented}
        onChange={(event) => onChange(event.target.checked)}
        disabled={!notice.data}
        error={error}
        className="mt-2"
      />
    </section>
  )
}

/** 고지 문구. 받는 중이면 그 안내를, 받지 못했으면 다시 불러오기를 보여 준다. */
function ConsentNoticeText({ notice }: { notice: UseQueryResult<ConsentNotice> }) {
  if (notice.data) {
    // 서버 문구의 줄바꿈을 살린다.
    return (
      <Notice tone="info" className="whitespace-pre-line">
        {notice.data.text}
      </Notice>
    )
  }
  if (notice.error) {
    return (
      <div>
        <Notice requestId={supportRequestId(notice.error)}>
          안내 문구를 불러오지 못했어요. 문구를 받아야 발급할 수 있어요.
        </Notice>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => void notice.refetch()}
          disabled={notice.isFetching}
        >
          안내 문구 다시 불러오기
        </Button>
      </div>
    )
  }
  return <p className="text-[14px] text-sub">안내 문구를 불러오고 있어요.</p>
}
