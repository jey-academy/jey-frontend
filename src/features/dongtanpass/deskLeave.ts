/**
 * 데스크 결과를 떠나기 전에 물을 것.
 * - `typed`: 등록 폼에 적은 것이 있다. 떠나면 지워진다.
 * - `registered`: 학생은 등록했는데 패스를 아직 사용 처리하지 못했다. 떠나면 사용 처리를 다시 할 수 없다.
 * - `sending`: 학생 등록이나 사용 처리를 보내고 답을 기다린다. 떠나지 못하게 막는다. 떠나면 답을 받을 곳이 없어,
 *   서버에서는 등록·처리됐는데 화면은 모르는 채로 남는다(등록 뒤의 사용 처리도 나가지 않는다).
 */
export type DeskLeaveGuard = 'none' | 'typed' | 'registered' | 'sending'

/**
 * 떠나는 방법. `next`는 "다음 패스 확인하기", `check`는 다른 패스를 확인(검색 칸·스캐너·카메라)하는 것,
 * `route`는 다른 화면으로 가는 것(메뉴·뒤로 가기)이다.
 */
export type DeskLeaveAction = 'next' | 'check' | 'route'

type LeaveText = { title: string; description: string; stay: string; leave: string }

/** 묻는 창의 문구. 남는 버튼이 왼쪽, 떠나는 버튼이 오른쪽이다. */
export function leaveText(
  guard: Exclude<DeskLeaveGuard, 'none' | 'sending'>,
  action: DeskLeaveAction,
): LeaveText {
  if (guard === 'registered') {
    return {
      title: '패스를 사용하지 않고 넘어갈까요?',
      description: '학생은 이미 등록됐어요. 지금 넘어가면 이 패스는 사용 처리되지 않아요.',
      stay: '돌아가기',
      leave: action === 'check' ? '넘어가고 확인' : '넘어가기',
    }
  }
  return {
    title: '입력한 내용을 지울까요?',
    description:
      action === 'check'
        ? '다른 패스를 확인하면 지금 적은 등록 정보가 사라져요.'
        : '다음 패스를 확인하면 지금 적은 등록 정보가 사라져요.',
    stay: '계속 입력',
    leave: action === 'check' ? '지우고 확인' : '지우고 다음 패스',
  }
}

/** 보내는 동안 떠나려 할 때 알리는 창의 문구. 떠나는 버튼은 없다. */
export const SENDING_TEXT = {
  title: '처리하는 중이에요',
  description: '학생 등록과 패스 사용 처리가 끝난 뒤에 넘어갈 수 있어요.',
  close: '확인',
}

/** 다른 화면으로 가거나 페이지를 닫기 전에 막을지. 폼에 적은 것만 있으면 막지 않는다(학생 등록 화면과 같다). */
export function blocksRoute(guard: DeskLeaveGuard): boolean {
  return guard === 'registered' || guard === 'sending'
}
