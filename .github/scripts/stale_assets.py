"""배포에서 지울 지난 화면 파일을 고른다(#154).

배포마다 그 빌드의 화면 파일 목록을 버킷의 `deploys/<시각>.json`에 남긴다(배포 기록). 지난 빌드의 파일은
그 빌드가 다음 배포로 밀려난 때부터 `--days`일 동안 남긴다. 배포 전에 연 탭이 아직 받지 않은 화면을 열 수 있게 한다.
마지막으로 올린 시각이 아니라 밀려난 시각으로 센다. 배포 사이가 며칠이어도 밀려난 빌드는 그때부터 며칠을 남는다.

    stale_assets.py record --current dist/assets
        이번 빌드의 배포 기록(JSON)을 쓴다.

    stale_assets.py select --current dist/assets --manifests <배포 기록 폴더> --listing <assets 목록 JSON>
        지울 키를 한 줄에 하나씩 쓴다(`assets/…`와 더는 쓸모없는 `deploys/…`).
        배포 기록 폴더에는 이번 배포의 기록도 들어 있어야 한다(먼저 남기고 고른다).

지우지 않는 것
- 이번 빌드의 파일(새 index.html이 가리킨다). 날짜와 상관없다.
- 밀려난 지 `--days`일이 안 된 빌드의 파일
- 배포 기록이 생기기 전의 파일은 첫 배포 기록 때 밀려난 것으로 본다(그보다 일찍 밀려났을 수 있지만 늦게 지우는 쪽이 안전하다).
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ASSETS = 'assets/'
DEPLOYS = 'deploys/'
RECORD_TIME = '%Y%m%dT%H%M%SZ'


def record_name(now: datetime) -> str:
    """배포 기록의 키. 이름의 시각이 배포 시각이다(이름 순서가 시간 순서다)."""
    return f'{DEPLOYS}{now.strftime(RECORD_TIME)}.json'


def record_time(name: str) -> datetime:
    stem = name.rsplit('/', 1)[-1].removesuffix('.json')
    return datetime.strptime(stem, RECORD_TIME).replace(tzinfo=timezone.utc)


def files_in(folder: Path) -> set[str]:
    return {path.relative_to(folder).as_posix() for path in folder.rglob('*') if path.is_file()}


def stale_keys(
    listing: dict, records: dict[str, set[str]], current: set[str], now: datetime, days: int
) -> list[str]:
    """
    지울 키. `records`는 배포 기록 이름(`deploys/…json`)과 그 빌드의 파일 이름들이다.
    기록 k는 다음 기록의 시각에 밀려났다. 마지막 기록(이번 배포)은 지금 밀려나지 않았으므로 늘 남긴다.
    """
    cutoff = now - timedelta(days=days)
    ordered = sorted(records, key=record_time)
    keep = set(current)
    stale_records = []
    for index, name in enumerate(ordered):
        retired_at = record_time(ordered[index + 1]) if index + 1 < len(ordered) else now
        if retired_at >= cutoff:
            keep |= records[name]
        else:
            # 마지막 기록은 밀려난 때가 지금이라 여기 오지 않는다.
            stale_records.append(name)
    # 기록이 생기기 전의 파일은 첫 기록 때 밀려난 것으로 본다. 기록이 없으면 지금 밀려난 것이다.
    unknown_retired_at = record_time(ordered[0]) if ordered else now
    known = set().union(*records.values()) if records else set()

    stale = []
    for item in listing.get('Contents') or []:
        key = item['Key']
        name = key.removeprefix(ASSETS)
        if not key.startswith(ASSETS) or not name or name in keep:
            continue
        if name not in known and unknown_retired_at >= cutoff:
            continue
        stale.append(key)
    return sorted(stale) + stale_records


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['record', 'select'])
    parser.add_argument('--current', required=True, help='이번 빌드의 assets 폴더')
    parser.add_argument('--manifests', help='배포 기록(JSON)을 받아 둔 폴더')
    parser.add_argument('--listing', help='assets 목록(list-objects-v2의 JSON)')
    parser.add_argument('--days', type=int, default=7)
    args = parser.parse_args(argv)

    current = files_in(Path(args.current))
    if not current:
        # 빌드가 비었다면 무언가 잘못됐다. 아무것도 지우거나 남기지 않는다.
        print('이번 빌드의 assets가 비어 있어요', file=sys.stderr)
        return 1

    if args.command == 'record':
        print(json.dumps(sorted(current)))
        return 0

    if not args.manifests or not args.listing:
        print('select에는 --manifests와 --listing이 있어야 해요', file=sys.stderr)
        return 2
    raw = Path(args.listing).read_text(encoding='utf-8').strip()
    if not raw:
        # 목록을 받지 못했다(권한, 연결). 방금 화면 파일을 올렸으니 빈 목록일 수 없다. 조용히 넘어가지 않는다.
        print('assets 목록이 비어 있어요(조회 실패?)', file=sys.stderr)
        return 1
    records = {
        f'{DEPLOYS}{path.name}': set(json.loads(path.read_text(encoding='utf-8')))
        for path in Path(args.manifests).glob('*.json')
    }
    if not records:
        # 이번 배포의 기록을 먼저 남겼으니 하나는 있어야 한다.
        print('배포 기록이 없어요', file=sys.stderr)
        return 1
    for key in stale_keys(json.loads(raw), records, current, datetime.now(timezone.utc), args.days):
        print(key)
    return 0


if __name__ == '__main__':
    sys.exit(main())
