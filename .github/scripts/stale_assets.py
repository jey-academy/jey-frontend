"""배포에서 지울 지난 화면 파일을 고른다(#154).

`aws s3api list-objects-v2 --prefix assets/`의 JSON 출력을 표준 입력으로 받아, 지울 키를 한 줄에 하나씩 쓴다.
지우는 것은 둘 다 맞는 파일뿐이다.
- 이번 빌드(`--current` 폴더)에 없다
- 마지막으로 올린 지 `--days`일이 지났다

이번 빌드의 파일은 날짜와 상관없이 지우지 않는다. 배포 전에 연 탭이 지난 파일을 며칠 더 받을 수 있게 남긴다.
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def parse_time(value: str) -> datetime:
    # 예: 2026-10-20T13:55:47.000Z 또는 2026-10-20T13:55:47+00:00
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def stale_keys(listing: dict, current: set[str], now: datetime, days: int) -> list[str]:
    cutoff = now - timedelta(days=days)
    keys = []
    for item in listing.get('Contents') or []:
        key = item['Key']
        name = key.removeprefix('assets/')
        if not name or name in current:
            continue
        if parse_time(item['LastModified']) < cutoff:
            keys.append(key)
    return sorted(keys)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--current', required=True, help='이번 빌드의 assets 폴더')
    parser.add_argument('--days', type=int, default=7)
    args = parser.parse_args()

    current_dir = Path(args.current)
    current = {str(path.relative_to(current_dir)).replace('\\', '/') for path in current_dir.rglob('*') if path.is_file()}
    if not current:
        # 빌드가 비었다면 무언가 잘못됐다. 아무것도 지우지 않는다.
        print('이번 빌드의 assets가 비어 있어요', file=sys.stderr)
        return 1

    raw = sys.stdin.read().strip()
    listing = json.loads(raw) if raw else {}
    for key in stale_keys(listing, current, datetime.now(timezone.utc), args.days):
        print(key)
    return 0


if __name__ == '__main__':
    sys.exit(main())
