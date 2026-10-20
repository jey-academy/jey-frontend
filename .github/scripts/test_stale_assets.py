"""stale_assets.py의 테스트. CI의 check 잡이 돌린다(python3 -m unittest discover -s .github/scripts)."""

from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path

from stale_assets import RECORD_TIME, main, read_records, stale_keys

NOW = datetime(2026, 10, 20, 12, 0, 0, tzinfo=timezone.utc)
OLD = '2020-01-01T00:00:00.000Z'


def listing(*keys: str) -> dict:
    return {'Contents': [{'Key': key, 'LastModified': OLD} for key in keys]}


def assets(*names: str) -> dict:
    return listing(*(f'assets/{name}' for name in names))


def ago(days: float) -> str:
    return (NOW - timedelta(days=days)).strftime(RECORD_TIME)


class StaleKeys(unittest.TestCase):
    def test_이번_빌드의_파일은_지우지_않는다(self):
        self.assertEqual(stale_keys(assets('a.js'), {ago(0): {'a.js'}}, {'a.js'}, NOW, 7), [])

    def test_이번_빌드의_파일은_어느_기록에도_없어도_지우지_않는다(self):
        # 기록이 오래돼 기록 밖의 파일은 지우는 때다. 그래도 이번 빌드의 파일은 남긴다.
        records = {ago(30): {'x.js'}, ago(20): {'y.js'}}
        self.assertEqual(stale_keys(assets('a.js'), records, {'a.js'}, NOW, 7), [f'deploys/{ago(30)}/'])

    def test_밀려난_지_7일이_안_된_빌드의_파일은_남긴다(self):
        # 30일 전 배포(old.js)가 6일 전 배포로 밀려났다. 마지막으로 올린 때가 아니라 밀려난 때로 센다.
        records = {ago(30): {'old.js'}, ago(6): {'mid.js'}, ago(0): {'new.js'}}
        self.assertEqual(stale_keys(assets('old.js', 'mid.js', 'new.js'), records, {'new.js'}, NOW, 7), [])

    def test_밀려난_지_7일이_지난_빌드의_파일과_그_기록을_지운다(self):
        records = {ago(30): {'old.js'}, ago(8): {'mid.js'}, ago(0): {'new.js'}}
        self.assertEqual(
            stale_keys(assets('old.js', 'mid.js', 'new.js'), records, {'new.js'}, NOW, 7),
            ['assets/old.js', f'deploys/{ago(30)}/'],
        )

    def test_직전_빌드는_배포_사이가_길어도_지금_밀려났으므로_남긴다(self):
        records = {ago(40): {'prev.js'}, ago(0): {'new.js'}}
        self.assertEqual(stale_keys(assets('prev.js', 'new.js'), records, {'new.js'}, NOW, 7), [])

    def test_여러_빌드에_걸친_파일은_남는_빌드가_하나라도_있으면_남긴다(self):
        records = {ago(30): {'shared.js'}, ago(8): {'shared.js'}, ago(0): {'new.js'}}
        self.assertEqual(stale_keys(assets('shared.js'), records, {'new.js'}, NOW, 7), [f'deploys/{ago(30)}/'])

    def test_기록이_생기기_전의_파일은_첫_기록_때_밀려난_것으로_본다(self):
        self.assertEqual(stale_keys(assets('legacy.js'), {ago(6): {'a.js'}, ago(0): {'b.js'}}, {'b.js'}, NOW, 7), [])
        self.assertEqual(
            stale_keys(assets('legacy.js'), {ago(8): {'a.js'}, ago(0): {'b.js'}}, {'b.js'}, NOW, 7),
            ['assets/legacy.js'],
        )

    def test_첫_배포에서는_아무것도_지우지_않는다(self):
        self.assertEqual(stale_keys(assets('legacy.js'), {ago(0): {'b.js'}}, {'b.js'}, NOW, 7), [])

    def test_폴더_표시_키와_빈_목록(self):
        records = {ago(0): {'a.js'}}
        self.assertEqual(stale_keys(listing('assets/'), records, {'a.js'}, NOW, 7), [])
        self.assertEqual(stale_keys({}, records, {'a.js'}, NOW, 7), [])
        self.assertEqual(stale_keys({'Contents': None}, records, {'a.js'}, NOW, 7), [])

    def test_하위_폴더의_파일_이름도_맞춘다(self):
        records = {ago(30): {'sub/old.wasm'}, ago(8): {'x.js'}, ago(0): {'sub/new.wasm'}}
        self.assertEqual(
            stale_keys(assets('sub/old.wasm', 'sub/new.wasm'), records, {'sub/new.wasm'}, NOW, 7),
            ['assets/sub/old.wasm', f'deploys/{ago(30)}/'],
        )


class ReadRecords(unittest.TestCase):
    def test_기록을_시각별로_읽고_기록_모양이_아닌_키는_따로_돌려준다(self):
        records, others = read_records(
            listing(
                'deploys/20261020T152835Z/index-A.js',
                'deploys/20261020T152835Z/sub/x.wasm',
                'deploys/20261021T000000Z/index-B.js',
                'deploys/20261020T152835Z.json',
                'deploys/not-a-time/index-C.js',
            )
        )
        self.assertEqual(
            records,
            {'20261020T152835Z': {'index-A.js', 'sub/x.wasm'}, '20261021T000000Z': {'index-B.js'}},
        )
        self.assertEqual(others, ['deploys/20261020T152835Z.json', 'deploys/not-a-time/index-C.js'])


class Main(unittest.TestCase):
    def run_main(self, *argv: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.current = self.root / 'assets'
        (self.current / 'sub').mkdir(parents=True)
        (self.current / 'index-NEW.js').write_text('a')
        (self.current / 'sub' / 'x.wasm').write_text('b')
        self.deploys = self.root / 'deploys.json'
        self.listing = self.root / 'listing.json'

    def tearDown(self):
        self.tmp.cleanup()

    def select(self) -> tuple[int, str, str]:
        return self.run_main(
            'select', '--current', str(self.current), '--deploys', str(self.deploys), '--listing', str(self.listing)
        )

    def test_record는_시각_폴더_아래에_파일_이름으로_빈_파일을_만든다(self):
        out = self.root / 'record'
        code, _, _ = self.run_main('record', '--current', str(self.current), '--out', str(out))
        self.assertEqual(code, 0)
        [folder] = list(out.iterdir())
        self.assertIsNotNone(datetime.strptime(folder.name, RECORD_TIME))
        self.assertEqual(
            sorted(p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file()),
            ['index-NEW.js', 'sub/x.wasm'],
        )
        self.assertEqual((folder / 'index-NEW.js').read_bytes(), b'')

    def test_빈_빌드면_실패한다(self):
        empty = self.root / 'empty'
        empty.mkdir()
        self.assertEqual(self.run_main('record', '--current', str(empty), '--out', str(self.root / 'r'))[0], 1)

    def test_목록을_받지_못했으면_조용히_넘어가지_않고_실패한다(self):
        self.deploys.write_text(json.dumps(listing('deploys/20261020T152835Z/index-NEW.js')))
        self.listing.write_text('')
        code, out, err = self.select()
        self.assertEqual((code, out), (1, ''))
        self.assertIn('assets 목록', err)
        self.deploys.write_text('')
        self.listing.write_text(json.dumps(assets('index-NEW.js')))
        code, out, err = self.select()
        self.assertEqual((code, out), (1, ''))
        self.assertIn('deploys 목록', err)

    def test_배포_기록이_없으면_실패한다(self):
        self.deploys.write_text(json.dumps(listing('deploys/20261020T152835Z.json')))
        self.listing.write_text(json.dumps(assets('index-NEW.js')))
        code, out, _ = self.select()
        self.assertEqual((code, out), (1, ''))

    def test_이전_방식의_기록은_지운다(self):
        self.deploys.write_text(
            json.dumps(listing('deploys/20261020T152835Z.json', 'deploys/20261020T152835Z/index-NEW.js'))
        )
        self.listing.write_text(json.dumps(assets('index-NEW.js')))
        code, out, _ = self.select()
        self.assertEqual((code, out.split()), (0, ['deploys/20261020T152835Z.json']))


if __name__ == '__main__':
    unittest.main()
