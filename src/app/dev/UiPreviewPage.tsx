import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  Button,
  Card,
  NavTabs,
  Notice,
  Pill,
  Segmented,
  SelectField,
  StatusBanner,
  TextField,
} from '@/shared/ui'
import './prototype-reference.css'

const previewLinks = [
  { to: '/find', label: '학부모 틀 (폭 390px에서 확인)' },
  { to: '/desk/dongtanpass', label: '직원 틀 (폭 1280px에서 확인)' },
  { to: '/desk/error-preview', label: '직원 틀 안의 에러 화면' },
  { to: '/desk/none', label: '직원 틀 안의 없는 주소' },
  { to: '/none', label: '학부모 틀 안의 없는 주소' },
]

// 왼쪽: shared/ui 컴포넌트 / 오른쪽: 프로토타입 원본 CSS. 같은 줄끼리 똑같아 보여야 한다.
export function UiPreviewPage() {
  return (
    <main className="mx-auto max-w-[1080px] px-6 pt-7 pb-16">
      <h1 className="text-[26px] font-bold tracking-[-0.03em]">UI 미리보기</h1>
      <p className="mb-5 text-sub">왼쪽은 shared/ui, 오른쪽은 프로토타입 원본이에요.</p>

      <div className="mb-2 grid grid-cols-2 gap-6 text-[14px] font-semibold text-sub">
        <span>shared/ui</span>
        <span>프로토타입</span>
      </div>

      <Row title="Button 기본">
        <Button>확인하기</Button>
        <button className="btn">확인하기</button>
      </Row>
      <Row title="Button 비활성">
        <Button disabled>확인 중</Button>
        <button className="btn" disabled>
          확인 중
        </button>
      </Row>
      <Row title="Button ghost">
        <Button variant="ghost">링크 복사</Button>
        <button className="btn ghost">링크 복사</button>
      </Row>
      <Row title="Button sm · ghost sm (터치 영역은 44px)">
        <div className="flex gap-2">
          <Button size="sm">QR 보기</Button>
          <Button size="sm" variant="ghost">
            링크 복사
          </Button>
        </div>
        <div className="flex gap-2">
          <button className="btn sm">QR 보기</button>
          <button className="btn sm ghost">링크 복사</button>
        </div>
      </Row>
      <Row title="Button block · ghost block">
        <div className="grid gap-2">
          <Button block>패스 발급하기</Button>
          <Button block variant="ghost">
            닫기
          </Button>
        </div>
        <div className="grid gap-2">
          <button className="btn block">패스 발급하기</button>
          <button className="btn ghost block">닫기</button>
        </div>
      </Row>

      <Row title="Pill">
        <div className="flex gap-2">
          <Pill status="valid" />
          <Pill status="used" />
          <Pill status="expired" />
        </div>
        <div className="flex gap-2">
          <span className="pill valid">사용 가능</span>
          <span className="pill used">사용 완료</span>
          <span className="pill expired">기간 만료</span>
        </div>
      </Row>

      <Row title="Card">
        <Card>
          <h2 className="mb-1 text-[19px] font-bold tracking-[-0.03em]">발급 정보</h2>
          <p className="mb-[18px] text-[14px] text-sub">
            발급 후 나오는 링크를 학부모님께 카카오톡이나 문자로 보내 주세요.
          </p>
          <Button block>패스 발급하기</Button>
        </Card>
        <section className="card">
          <h2>발급 정보</h2>
          <p className="sub">발급 후 나오는 링크를 학부모님께 카카오톡이나 문자로 보내 주세요.</p>
          <button className="btn block">패스 발급하기</button>
        </section>
      </Row>
      <Row title="TextField · SelectField">
        <div className="grid gap-3.5">
          <TextField label="학생 이름" placeholder="김도윤" />
          <SelectField label="반" defaultValue="">
            <option value="">반을 선택하세요</option>
            <option value="A1">초등 A1</option>
          </SelectField>
          <TextField label="혜택" defaultValue="첫 달 수강료 5% 할인" disabled />
        </div>
        <div className="grid gap-3.5">
          <div className="field">
            <label htmlFor="proto-name">학생 이름</label>
            <input id="proto-name" placeholder="김도윤" />
          </div>
          <div className="field">
            <label htmlFor="proto-klass">반</label>
            <select id="proto-klass" defaultValue="">
              <option value="">반을 선택하세요</option>
              <option value="A1">초등 A1</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="proto-benefit">혜택</label>
            <input id="proto-benefit" defaultValue="첫 달 수강료 5% 할인" disabled />
          </div>
        </div>
      </Row>

      <Row title="TextField 도움말 · 에러 (프로토타입에는 없음)">
        <div className="grid gap-3.5">
          <TextField label="교재비" defaultValue="0" hint="교재를 받지 않으면 0으로 두세요." />
          <TextField label="학년" defaultValue="오" error="숫자만 입력해 주세요." />
        </div>
        <div />
      </Row>

      <Row title="Segmented">
        <Segmented
          label="이번 달 수업 횟수"
          name="preview-count"
          defaultValue="9"
          options={[
            { value: '8', label: '8회' },
            { value: '9', label: '9회' },
            { value: '10', label: '10회' },
          ]}
        />
        <div className="field">
          <label>이번 달 수업 횟수</label>
          <div className="seg" role="radiogroup">
            <label>
              <input type="radio" name="proto-count" value="8" />
              <span>8회</span>
            </label>
            <label>
              <input type="radio" name="proto-count" value="9" defaultChecked />
              <span>9회</span>
            </label>
            <label>
              <input type="radio" name="proto-count" value="10" />
              <span>10회</span>
            </label>
          </div>
        </div>
      </Row>

      <Row title="Notice (글자색은 토큰 pill-expired, 프로토타입은 #B4282D)">
        <Notice>패스를 찾을 수 없어요. 이름과 전화번호를 다시 확인해 주세요.</Notice>
        <div className="toast">패스를 찾을 수 없어요. 이름과 전화번호를 다시 확인해 주세요.</div>
      </Row>

      <Row title="StatusBanner">
        <div className="grid gap-2">
          <StatusBanner status="valid" description="2026.11.05까지 사용 가능" />
          <StatusBanner status="used" description="2026.10.07 JEY 어학원 동탄관에서 사용했어요" />
          <StatusBanner status="expired" description="2026.09.20에 만료됐어요" />
        </div>
        <div className="grid gap-2">
          <div className="status valid">
            <div className="ico">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </div>
            <div>
              <b>사용할 수 있는 패스예요</b>
              <span>2026.11.05까지 사용 가능</span>
            </div>
          </div>
          <div className="status used">
            <div className="ico">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              >
                <path d="M6 12h12" />
              </svg>
            </div>
            <div>
              <b>이미 사용한 패스예요</b>
              <span>2026.10.07 JEY 어학원 동탄관에서 사용했어요</span>
            </div>
          </div>
          <div className="status expired">
            <div className="ico">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4.5l3 2" />
              </svg>
            </div>
            <div>
              <b>사용 기한이 지난 패스예요</b>
              <span>2026.09.20에 만료됐어요</span>
            </div>
          </div>
        </div>
      </Row>

      <Row title="NavTabs (선택된 탭은 지금 주소에 따라 정해진다)">
        <NavTabs
          label="미리보기 메뉴"
          className="w-max"
          items={[
            { to: '/ui-preview', label: '패스 확인' },
            { to: '/partner/passes/new', label: '패스 발급' },
            { to: '/partner/passes', label: '패스 목록', end: true },
          ]}
        />
        <div className="tabs">
          <button aria-selected="true">패스 확인</button>
          <button aria-selected="false">패스 발급</button>
          <button aria-selected="false">패스 목록</button>
        </div>
      </Row>

      <section className="border-t border-line py-5">
        <h2 className="mb-3 text-[15px] font-semibold text-sub">레이아웃과 에러 화면</h2>
        <ul className="grid gap-1.5">
          {previewLinks.map((link) => (
            <li key={link.to}>
              <Link to={link.to} className="font-semibold text-night">
                {link.label}
              </Link>
              <span className="text-sub"> {link.to}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

function Row({ title, children }: { title: string; children: [ReactNode, ReactNode] }) {
  const [ours, proto] = children
  return (
    <section className="border-t border-line py-5">
      <h2 className="mb-3 text-[15px] font-semibold text-sub">{title}</h2>
      <div className="grid grid-cols-2 items-start gap-6">
        <div>{ours}</div>
        <div className="proto">{proto}</div>
      </div>
    </section>
  )
}
