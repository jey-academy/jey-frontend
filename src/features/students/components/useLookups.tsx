import { useCampuses, useClasses } from '@/shared/campus'
import { Button, Notice } from '@/shared/ui'

/**
 * 지점·반 목록이 준비됐는지와, 받지 못했을 때의 안내.
 * 목록을 받기 전에는 저장하지 않는다. 선택지가 비어 있으면 반이 없는 지점처럼 보이고,
 * 화면에 보이지 않는 값(미리 골라 둔 지점, 지금 반)이 그대로 보내진다.
 */
export function useLookups() {
  const campuses = useCampuses()
  const classes = useClasses()
  const ready = campuses.data !== undefined && classes.data !== undefined

  return {
    campuses: campuses.data ?? [],
    classes: classes.data ?? [],
    ready,
    /** 받지 못했을 때 폼에 넣을 안내. 준비됐거나 아직 받는 중이면 null이다. */
    errorNotice:
      !ready && (campuses.error ?? classes.error) ? (
        <div>
          <Notice>지점·반 목록을 불러오지 못했어요. 목록을 받아야 저장할 수 있어요.</Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => {
              void campuses.refetch()
              void classes.refetch()
            }}
            disabled={campuses.isFetching || classes.isFetching}
          >
            지점·반 다시 불러오기
          </Button>
        </div>
      ) : null,
  }
}
