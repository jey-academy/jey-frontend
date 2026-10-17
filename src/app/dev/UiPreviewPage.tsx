import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  Button,
  Card,
  ChoiceCard,
  LogoMark,
  MiniPassCard,
  Modal,
  NavTabs,
  Notice,
  PassCard,
  Pill,
  QrCode,
  QrScanButton,
  QrScanner,
  QrView,
  Segmented,
  SelectField,
  StatusBanner,
  Steps,
  TextField,
  TimeLeft,
} from '@/shared/ui'
import { canUseCamera } from '@/shared/lib'
import { cn } from '@/shared/lib/cn'
import './prototype-reference.css'

// 클래스 이름을 문자열 그대로 적어야 Tailwind가 찾아서 만든다.
const newColorTokens = [
  { name: 'night-soft', className: 'bg-night-soft' },
  { name: 'night-tint', className: 'bg-night-tint' },
  { name: 'glow-hover', className: 'bg-glow-hover' },
  { name: 'glow-ink', className: 'bg-glow-ink' },
  { name: 'glow-soft', className: 'bg-glow-soft' },
  { name: 'glow-soft-ink', className: 'bg-glow-soft-ink' },
  { name: 'red-ink', className: 'bg-red-ink' },
  { name: 'placeholder', className: 'bg-placeholder' },
]

const previewLinks = [
  { to: '/find', label: '학부모 틀 (폭 390px에서 확인)' },
  { to: '/desk/dongtanpass', label: '직원 틀 (폭 1280px에서 확인)' },
  { to: '/desk/error-preview', label: '직원 틀 안의 에러 화면' },
  { to: '/desk/none', label: '직원 틀 안의 없는 주소' },
  { to: '/none', label: '학부모 틀 안의 없는 주소' },
]

const samplePass = {
  benefitLabel: 'JEY 어학원 동탄관 첫 달 수강료',
  discount: '5%',
  holderName: '김*윤',
  passNumber: 'DT-7KQ4MX',
  expiresOn: '2026.11.16',
}
const sampleQrValue = 'dtp1.eyJwIjoiRFQtN0tRNE1YIn0.c2lnbmF0dXJl'

const passStates = [
  { status: 'valid', label: '사용 가능' },
  { status: 'used', label: '사용 완료' },
  { status: 'expired', label: '기간 만료' },
  { status: 'canceled', label: '발급 취소' },
] as const

const holderSteps = [
  {
    title: 'JEY 어학원 동탄관 데스크에 방문해요',
    description: '신규 등록할 때 한 번 쓸 수 있어요',
  },
  { title: '위 QR을 보여 주세요', description: 'QR이 안 되면 패스 번호를 알려 주세요' },
  {
    title: '학생 이름과 학부모 번호를 확인해요',
    description: '패스를 받을 때 알려 준 번호로 등록해 주세요',
  },
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

      <Row title="Pill (발급 취소는 프로토타입에 없음)">
        <div className="flex flex-wrap gap-2">
          <Pill status="valid" />
          <Pill status="used" />
          <Pill status="expired" />
          <Pill status="canceled" />
        </div>
        <div className="flex gap-2">
          <span className="pill valid">사용 가능</span>
          <span className="pill used">사용 완료</span>
          <span className="pill expired">기간 만료</span>
        </div>
      </Row>

      {passStates.map(({ status, label }) => (
        <Row key={status} title={`PassCard ${label}`} stackOnMobile>
          <div className="max-w-[400px]">
            <PassCard status={status} {...samplePass} />
          </div>
          {status === 'canceled' ? (
            <p className="text-sub">프로토타입에 없음</p>
          ) : (
            <div className="max-w-[400px]">
              <ProtoPassCard status={status} />
            </div>
          )}
        </Row>
      ))}
      <Row title="PassCard + QrView 보임 (프로토타입 QR은 같은 라이브러리로 그림)" stackOnMobile>
        <div className="isolate max-w-[400px]">
          <PassCard status="valid" {...samplePass} />
          <QrView state="shown" value={sampleQrValue} passNumber={samplePass.passNumber} />
        </div>
        <div className="holder-wrap max-w-[400px]">
          <ProtoPassCard status="valid" />
          <section className="qrsheet">
            <div className="qr">
              <QrCode value={sampleQrValue} label="패스 QR" />
            </div>
            <div>
              <b>데스크에 이 QR을 보여 주세요</b>
              <span className="s">화면 밝기를 올리면 더 잘 찍혀요</span>
              <span className="no num">{samplePass.passNumber}</span>
            </div>
          </section>
        </div>
      </Row>
      <Row title="QrView 불러오는 중 · 받지 못함 (프로토타입에 없음)" stackOnMobile>
        {/* QrView는 카드 밑으로 26px 겹치게 만들어져 있어 혼자 둘 때는 그만큼 띄운다. */}
        <div className="grid max-w-[400px] gap-4">
          <div className="pt-[26px]">
            <QrView state="loading" passNumber={samplePass.passNumber} />
          </div>
          <div className="pt-[26px]">
            <QrView
              state="failed"
              value={sampleQrValue}
              passNumber={samplePass.passNumber}
              onRetry={() => {}}
            />
          </div>
        </div>
        <p className="text-sub">프로토타입에 없음</p>
      </Row>
      <Row title="TimeLeft 20일 · 7일 (7일 이하 red는 프로토타입에 없음)" stackOnMobile>
        <div className="grid max-w-[400px] gap-3.5">
          <TimeLeft daysLeft={20} totalDays={31} />
          <TimeLeft daysLeft={7} totalDays={31} />
        </div>
        <div className="max-w-[400px]">
          <div className="timeleft" style={{ marginTop: 0 }}>
            <div className="row">
              <span>남은 기간</span>
              <b className="num">20일</b>
            </div>
            <div className="bar">
              <i style={{ width: '65%' }} />
            </div>
          </div>
        </div>
      </Row>
      <Row title="Steps (3번째 단계는 프로토타입에 없음)" stackOnMobile>
        {/* Sheet가 아직 없어 같은 모양으로 감싼다. */}
        <div className="max-w-[400px] rounded-md bg-card px-[18px] py-5">
          <Steps items={holderSteps} />
        </div>
        <section className="sheet max-w-[400px]" style={{ marginTop: 0 }}>
          <ol className="steps">
            {holderSteps.slice(0, 2).map((step, index) => (
              <li key={step.title}>
                <span>{index + 1}</span>
                <div>
                  <b>{step.title}</b>
                  <em>{step.description}</em>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </Row>

      <Row
        title="MiniPassCard 뒤 · 앞 (할인율 숫자 대신 문구, 양방향이라 서버 값을 박지 않음)"
        stackOnMobile
      >
        <div className="relative h-[300px] max-w-[400px]">
          <div className="absolute top-[90px] right-[70px] w-[300px] -rotate-5">
            <MiniPassCard layer="back" />
          </div>
          <div className="absolute top-2.5 right-2.5 w-[300px] rotate-6">
            <MiniPassCard layer="front" caption="첫 달 할인" />
          </div>
        </div>
        <div className="relative h-[300px] max-w-[400px]">
          <div className="mini b">
            <span className="logo">동탄고패스</span>
          </div>
          <div className="mini a">
            <span className="logo">동탄고패스</span>
            <div className="pct">
              5%<small>할인</small>
            </div>
          </div>
        </div>
      </Row>
      <Row title="ChoiceCard 학부모 · 직원 (휴대폰 폭에서는 조금 작아짐)" stackOnMobile>
        <div className="grid max-w-[460px] gap-4">
          <ChoiceCard
            to="/find"
            tone="glow"
            title="패스 링크 다시 받기"
            description="학부모·학생. 학생 이름과 학부모 번호로 새 링크를 받아요"
            icon={<LogoMark size={26} />}
          />
          <ChoiceCard
            to="/login"
            title="학원 직원 로그인"
            description="패스 발급과 확인"
            icon={<LogoMark size={26} />}
          />
        </div>
        <div className="grid max-w-[460px] gap-4">
          <a className="choice parent">
            <span className="ic">
              <LogoMark size={26} />
            </span>
            <span>
              <b>내 패스 보기</b>
              <span className="d">학부모, 학생용. 이름과 전화번호로 패스를 찾아요</span>
            </span>
            <span className="arr">›</span>
          </a>
          <a className="choice admin">
            <span className="ic">
              <LogoMark size={26} />
            </span>
            <span>
              <b>학원 관리자</b>
              <span className="d">패스 확인과 발급, 목록. 데스크 PIN이 필요해요</span>
            </span>
            <span className="arr">›</span>
          </a>
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

      <Row title="Segmented (글자 16px, 프로토타입과 같음)">
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

      <Row title="Notice info (늘 있는 안내, 프로토타입에는 없음)">
        <Notice tone="info">
          학생 이름과 학부모 번호의 대조값을 패스 본인 확인에만 써요. 동의는 발급 학원에서 받았어요.
        </Notice>
        <div />
      </Row>

      <Row title="새 토큰 (설계서 8.1의 추가분)">
        <div className="flex flex-wrap gap-2">
          {newColorTokens.map((token) => (
            <span key={token.name} className="grid w-[92px] gap-1 text-[13px] text-sub">
              <span className={cn('h-10 rounded-sm border border-line', token.className)} />
              {token.name}
            </span>
          ))}
          <span className="grid w-[92px] gap-1 text-[13px] text-sub">
            <span className="h-10 rounded-xl bg-night" />
            모서리 xl
          </span>
          <span className="grid w-[92px] gap-1 text-[13px] text-sub">
            <span className="h-10 rounded-md bg-card shadow-pin" />
            그림자 pin
          </span>
          <span className="grid w-[92px] gap-1 text-[13px] text-sub">
            <span className="h-10 rounded-md bg-card shadow-mini" />
            그림자 mini
          </span>
        </div>
        <div />
      </Row>

      <Row title="StatusBanner">
        <div className="grid gap-2">
          <StatusBanner status="valid" description="2026.11.05까지 사용 가능" />
          <StatusBanner status="used" description="2026.10.07 JEY 어학원 동탄관에서 사용했어요" />
          <StatusBanner status="expired" description="2026.09.20에 만료됐어요" />
          <StatusBanner
            status="canceled"
            description="2026.10.17에 고구마국어학원이 발급을 취소했어요"
          />
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

      <Row title="Modal (Esc, 배경 클릭, 닫기 버튼으로 닫힌다)">
        <ModalPreview />
        <ProtoModalPreview />
      </Row>

      <Row
        title="QrScanner 시험 (서버 없이 카메라·판독만. 휴대폰은 npm run dev:https로 연다)"
        stackOnMobile
      >
        <ScannerPreview />
        <p className="text-[14px] text-sub">
          학부모 패스 화면의 QR을 찍으면 읽은 글자가 왼쪽에 나와요. 데스크 확인은 하지 않아요.
        </p>
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

const protoLabels = { valid: '사용 가능', used: '사용 완료', expired: '기간 만료' } as const

function ProtoPassCard({ status }: { status: keyof typeof protoLabels }) {
  const off = status !== 'valid'
  return (
    <article className={cn('pass', off && 'off')}>
      <svg className="ripples" viewBox="0 0 420 420" aria-hidden="true">
        <circle
          cx="210"
          cy="210"
          r="70"
          fill="none"
          stroke="rgba(255,212,92,.45)"
          strokeWidth="2"
        />
        <g fill="none" stroke="rgba(255,255,255,.11)" strokeWidth="1.5">
          <circle cx="210" cy="210" r="110" />
          <circle cx="210" cy="210" r="150" />
          <circle cx="210" cy="210" r="190" />
        </g>
      </svg>
      <div className="pass-top">
        <span className="logo">
          <LogoMark />
          동탄고패스
        </span>
        <span className={cn('pill', status)}>{protoLabels[status]}</span>
      </div>
      {off && <div className="stampmark">{protoLabels[status]}</div>}
      <div className="benefit">
        <div className="where">{samplePass.benefitLabel}</div>
        <div className="pct num">
          {samplePass.discount}
          <small>할인</small>
        </div>
      </div>
      <div className="holderline">
        <div>
          <div className="who">{samplePass.holderName}</div>
          <div className="no num">{samplePass.passNumber}</div>
        </div>
        <div className="exp num">
          사용 기한<b>{samplePass.expiresOn}</b>
        </div>
      </div>
    </article>
  )
}

// 실기기에서 카메라가 켜지는지, 학부모 화면의 QR이 읽히는지 확인하는 칸. 읽은 글자는 화면에만 보여 준다.
function ScannerPreview() {
  const [open, setOpen] = useState(false)
  const [read, setRead] = useState<string | null>(null)

  if (!canUseCamera()) {
    return (
      <Notice tone="info">
        이 브라우저에서는 카메라를 켤 수 없어요. HTTPS(휴대폰은 npm run dev:https)나 localhost로
        열어 주세요.
      </Notice>
    )
  }
  return (
    <div className="grid gap-3">
      <div>
        <QrScanButton onClick={() => setOpen(true)} />
      </div>
      <p role="status" className="text-[14px] break-all">
        {read === null ? '아직 읽은 QR이 없어요.' : `읽은 글자(${read.length}자): ${read}`}
      </p>
      <QrScanner
        open={open}
        onClose={() => setOpen(false)}
        onScan={(text) => {
          setOpen(false)
          setRead(text)
        }}
      />
    </div>
  )
}

function ModalPreview() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        모달 열기
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="QR 찍기"
        description="학부모님 화면의 QR을 네모 안에 맞춰 주세요."
      >
        <Button variant="ghost" block className="mt-4" onClick={() => setOpen(false)}>
          닫기
        </Button>
      </Modal>
    </>
  )
}

function ProtoModalPreview() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn ghost" onClick={() => setOpen(true)}>
        모달 열기
      </button>
      {open && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="box">
            <h2>QR 찍기</h2>
            <p>학부모님 화면의 QR을 네모 안에 맞춰 주세요.</p>
            <button className="btn ghost block" onClick={() => setOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  )
}

type RowProps = {
  title: string
  children: [ReactNode, ReactNode]
  /** 좁은 화면(560px 이하)에서 위아래로 쌓는다. 학부모 화면 컴포넌트를 390px에서 볼 때 쓴다. */
  stackOnMobile?: boolean
}

function Row({ title, children, stackOnMobile = false }: RowProps) {
  const [ours, proto] = children
  return (
    <section className="border-t border-line py-5">
      <h2 className="mb-3 text-[15px] font-semibold text-sub">{title}</h2>
      <div
        className={cn(
          'grid grid-cols-2 items-start gap-6',
          stackOnMobile && 'max-[560px]:grid-cols-1',
        )}
      >
        <div>{ours}</div>
        <div className="proto">{proto}</div>
      </div>
    </section>
  )
}
