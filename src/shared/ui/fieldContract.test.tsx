import { render, screen } from '@testing-library/react'
import { createRef, type ReactElement } from 'react'
import { expect, test } from 'vitest'
import { SelectField } from './SelectField'
import { TextField } from './TextField'

// TextField와 SelectField는 같은 규칙(이름표, 도움말, 에러)을 따른다. 한쪽만 달라지지 않게 같은 테스트를 둘 다에 돌린다.
type FieldProps = {
  id?: string
  hint?: string
  error?: string
  className?: string
  'aria-describedby'?: string
}

const fields = [
  ['TextField', 'textbox', (props: FieldProps) => <TextField label="반" {...props} />],
  [
    'SelectField',
    'combobox',
    (props: FieldProps) => (
      <SelectField label="반" {...props}>
        <option value="">반을 선택하세요</option>
      </SelectField>
    ),
  ],
] as const satisfies readonly (readonly [string, string, (props: FieldProps) => ReactElement])[]

test.each(fields)('%s: id를 주면 그 id를 쓴다', (_name, role, field) => {
  render(field({ id: 'klass' }))

  expect(screen.getByRole(role, { name: '반' })).toHaveAttribute('id', 'klass')
})

test.each(fields)(
  '%s: 에러가 생겼다 사라져도 같은 칸에 설명이 따라 바뀐다',
  (_name, role, field) => {
    const { rerender } = render(field({ hint: '이번 달 등록 반' }))
    const control = screen.getByRole(role, { name: '반' })
    expect(control).toHaveAccessibleDescription('이번 달 등록 반')
    expect(control).not.toHaveAttribute('aria-invalid')
    expect(control).toHaveClass('border-transparent')

    rerender(field({ hint: '이번 달 등록 반', error: '반을 선택해 주세요.' }))
    expect(control).toBeInvalid()
    expect(control).toHaveAccessibleDescription('반을 선택해 주세요.')
    expect(control).toHaveClass('border-red')

    rerender(field({ hint: '이번 달 등록 반' }))
    expect(control).toBeInTheDocument()
    expect(control).not.toHaveAttribute('aria-invalid')
    expect(control).toHaveAccessibleDescription('이번 달 등록 반')
  },
)

test.each(fields)('%s: 빈 문자열 에러는 에러가 없는 것으로 본다', (_name, role, field) => {
  render(field({ hint: '이번 달 등록 반', error: '' }))

  const control = screen.getByRole(role, { name: '반' })
  expect(control).not.toHaveAttribute('aria-invalid')
  expect(control).toHaveAccessibleDescription('이번 달 등록 반')
})

test.each(fields)(
  '%s: 바깥에서 준 aria-describedby가 있어도 에러 설명이 연결된다',
  (_name, role, field) => {
    render(
      <>
        {field({ error: '반을 선택해 주세요.', 'aria-describedby': 'extra' })}
        <p id="extra">학년에 맞는 반만 보여요.</p>
      </>,
    )

    expect(screen.getByRole(role, { name: '반' })).toHaveAccessibleDescription(
      '학년에 맞는 반만 보여요. 반을 선택해 주세요.',
    )
  },
)

test.each(fields)(
  '%s: aria-describedby를 undefined로 줘도 도움말 연결이 지워지지 않는다',
  (_name, role, field) => {
    render(field({ hint: '이번 달 등록 반', 'aria-describedby': undefined }))

    expect(screen.getByRole(role, { name: '반' })).toHaveAccessibleDescription('이번 달 등록 반')
  },
)

test.each(fields)('%s: className은 칸이 아니라 바깥 묶음에 붙는다', (_name, role, field) => {
  const { container } = render(field({ className: 'mt-4' }))

  expect(container.firstChild).toHaveClass('mt-4')
  expect(screen.getByRole(role, { name: '반' })).not.toHaveClass('mt-4')
})

test.each(fields)(
  '%s: className을 주지 않으면 빈 class 속성을 남기지 않는다',
  (_name, _role, field) => {
    const { container } = render(field({}))

    expect(container.firstChild).not.toHaveAttribute('class')
  },
)

test('TextField: ref로 입력창을 잡아 포커스를 줄 수 있다', () => {
  const ref = createRef<HTMLInputElement>()
  render(<TextField label="학생 이름" ref={ref} />)

  ref.current?.focus()

  expect(screen.getByRole('textbox', { name: '학생 이름' })).toHaveFocus()
})

test('SelectField: ref로 선택 상자를 잡아 포커스를 줄 수 있다', () => {
  const ref = createRef<HTMLSelectElement>()
  render(
    <SelectField label="반" ref={ref}>
      <option value="">반을 선택하세요</option>
    </SelectField>,
  )

  ref.current?.focus()

  expect(screen.getByRole('combobox', { name: '반' })).toHaveFocus()
})
