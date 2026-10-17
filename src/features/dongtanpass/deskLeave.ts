/**
 * 데스크 결과를 떠나기 전에 물을 것.
 * - `typed`: 등록 폼에 적은 것이 있다. 떠나면 지워진다.
 * - `registered`: 학생은 등록했는데 패스를 아직 사용 처리하지 못했다. 떠나면 사용 처리를 다시 할 수 없다.
 */
export type DeskLeaveGuard = 'none' | 'typed' | 'registered'

/** 떠나는 방법. `next`는 "다음 패스 확인하기", `check`는 다른 패스를 확인(검색 칸·스캐너·카메라)하는 것이다. */
export type DeskLeaveAction = 'next' | 'check'

type LeaveText = { title: string; description: string; stay: string; leave: string }

/** 묻는 창의 문구. 남는 버튼이 왼쪽, 떠나는 버튼이 오른쪽이다. */
export function leaveText(
  guard: Exclude<DeskLeaveGuard, 'none'>,
  action: DeskLeaveAction,
): LeaveText {
  if (guard === 'registered') {
    return {
      title: '패스를 사용하지 않고 넘어갈까요?',
      description: '학생은 이미 등록됐어요. 지금 넘어가면 이 패스는 사용 처리되지 않아요.',
      stay: '돌아가기',
      leave: action === 'next' ? '넘어가기' : '넘어가고 확인',
    }
  }
  return {
    title: '입력한 내용을 지울까요?',
    description:
      action === 'next'
        ? '다음 패스를 확인하면 지금 적은 등록 정보가 사라져요.'
        : '다른 패스를 확인하면 지금 적은 등록 정보가 사라져요.',
    stay: '계속 입력',
    leave: action === 'next' ? '지우고 다음 패스' : '지우고 확인',
  }
}
