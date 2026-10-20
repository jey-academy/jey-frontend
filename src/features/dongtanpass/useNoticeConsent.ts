import { useEffect, useRef, useState } from 'react'
import { useQueryClient, type QueryKey, type UseQueryResult } from '@tanstack/react-query'
import type { ConsentNotice } from './api'

/**
 * 고지 문구에 받은 동의. 켜짐·꺼짐 대신 동의한 문구의 버전을 들고 있다.
 * 창 포커스·재연결 때 문구를 다시 받아 버전이 바뀌면, 학부모가 확인한 문구가 아니므로 동의가 저절로 풀린다.
 * 연계 학원 발급과 JEY 발급이 같이 쓴다. 두 문구는 키와 버전이 다르다.
 *
 * `rejected`는 서버가 "보여 준 문구가 지금 문구와 다르다"고 거부했는지다(DONGTANPASS_NOTICE_VERSION_MISMATCH).
 */
export function useNoticeConsent({
  notice,
  queryKey,
  rejected,
}: {
  notice: UseQueryResult<ConsentNotice>
  queryKey: QueryKey
  rejected: boolean
}) {
  const queryClient = useQueryClient()
  const [consentedVersion, setConsentedVersion] = useState<string | null>(null)
  const boxRef = useRef<HTMLInputElement>(null)
  // 문구가 바뀌었다는 답을 받았는지. 새 문구가 오면 동의 칸으로 포커스를 옮겨 다시 확인하게 한다.
  const refocus = useRef(false)

  useEffect(() => {
    if (!refocus.current || !notice.data) return
    refocus.current = false
    boxRef.current?.focus()
  }, [notice.data])

  const consented = consentedVersion !== null && consentedVersion === notice.data?.version
  // 동의한 뒤 문구가 바뀌었다. 서버가 알려 준 경우와, 다시 받은 문구의 버전이 다른 경우다.
  // 뒤에서 바뀐 경우에는 포커스를 옮기지 않는다. 다른 칸에 입력하는 중일 수 있다. 안내와 꺼진 발급 버튼으로 알린다.
  const changed = rejected || (consentedVersion !== null && notice.data !== undefined && !consented)

  return {
    consented,
    changed,
    boxRef,
    /** 동의 칸을 켜고 끈다. 켤 때는 지금 보이는 문구의 버전에 동의한다. */
    setChecked(checked: boolean) {
      setConsentedVersion(checked ? (notice.data?.version ?? null) : null)
    },
    /** 다음 발급을 위해 동의를 푼다. */
    clear() {
      setConsentedVersion(null)
    },
    /**
     * 서버가 문구가 바뀌었다고 거부했다. 바뀐 문구를 읽고 다시 확인해야 한다. 옛 문구를 지우고(reset) 새로 받는다.
     * 다시 받기만 하면(invalidate) 받는 동안이나 받지 못했을 때 옛 문구와 켜진 동의 칸이 남는다.
     */
    noticeRejected() {
      setConsentedVersion(null)
      refocus.current = true
      void queryClient.resetQueries({ queryKey })
    },
  }
}

export type NoticeConsent = ReturnType<typeof useNoticeConsent>
