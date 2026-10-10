import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { SelectField } from './SelectField'
import { TextField } from './TextField'

test('이름표로 입력창을 찾을 수 있고 input 속성을 그대로 전달한다', async () => {
  const onChange = vi.fn()
  render(
    <TextField
      label="학생 이름"
      name="studentName"
      placeholder="김도윤"
      required
      onChange={onChange}
    />,
  )

  const input = screen.getByRole('textbox', { name: '학생 이름' })
  expect(input).toHaveAttribute('name', 'studentName')
  expect(input).toHaveAttribute('placeholder', '김도윤')
  expect(input).toBeRequired()

  await userEvent.type(input, '김')
  expect(onChange).toHaveBeenCalledOnce()
})

test('이름표를 누르면 입력창에 포커스가 간다', async () => {
  render(<TextField label="학교" />)

  await userEvent.click(screen.getByText('학교'))

  expect(screen.getByRole('textbox', { name: '학교' })).toHaveFocus()
})

test('도움말을 입력창의 설명으로 연결한다', () => {
  render(<TextField label="교재비" hint="교재를 받지 않으면 0으로 두세요." />)

  const input = screen.getByRole('textbox', { name: '교재비' })
  expect(input).toHaveAccessibleDescription('교재를 받지 않으면 0으로 두세요.')
  expect(input).not.toHaveAttribute('aria-invalid')
  expect(input).toHaveClass('border-transparent')
})

test('에러가 있으면 에러 상태로 표시하고 도움말 대신 에러를 설명으로 연결한다', () => {
  render(
    <TextField
      label="교재비"
      hint="교재를 받지 않으면 0으로 두세요."
      error="숫자만 입력해 주세요."
    />,
  )

  const input = screen.getByRole('textbox', { name: '교재비' })
  expect(input).toBeInvalid()
  expect(input).toHaveAccessibleDescription('숫자만 입력해 주세요.')
  expect(input).toHaveClass('border-red')
  expect(screen.queryByText('교재를 받지 않으면 0으로 두세요.')).not.toBeInTheDocument()
})

test('도움말과 에러가 없으면 설명을 연결하지 않는다', () => {
  render(<TextField label="학년" />)

  expect(screen.getByRole('textbox', { name: '학년' })).not.toHaveAttribute('aria-describedby')
})

test('id를 주면 그 id를 쓰고, 주지 않으면 입력창마다 다른 id를 만든다', () => {
  render(
    <>
      <TextField label="학생 이름" id="student-name" />
      <TextField label="학교" />
      <TextField label="학년" />
    </>,
  )

  expect(screen.getByRole('textbox', { name: '학생 이름' })).toHaveAttribute('id', 'student-name')
  const school = screen.getByRole('textbox', { name: '학교' })
  const grade = screen.getByRole('textbox', { name: '학년' })
  expect(school.id).not.toBe('')
  expect(school.id).not.toBe(grade.id)
})

test('비활성 입력창은 입력할 수 없다', async () => {
  render(<TextField label="혜택" defaultValue="첫 달 수강료 5% 할인" disabled />)

  const input = screen.getByRole('textbox', { name: '혜택' })
  await userEvent.type(input, '추가')

  expect(input).toBeDisabled()
  expect(input).toHaveValue('첫 달 수강료 5% 할인')
})

test('SelectField: 이름표로 선택 상자를 찾고 선택지를 고를 수 있다', async () => {
  const onChange = vi.fn()
  render(
    <SelectField label="반" name="klass" defaultValue="" onChange={onChange}>
      <option value="">반을 선택하세요</option>
      <option value="A1">초등 A1</option>
      <option value="B2">중등 B2</option>
    </SelectField>,
  )

  const select = screen.getByRole('combobox', { name: '반' })
  await userEvent.selectOptions(select, '중등 B2')

  expect(select).toHaveValue('B2')
  expect(onChange).toHaveBeenCalledOnce()
})

test('SelectField: 에러가 있으면 에러 상태로 표시하고 설명으로 연결한다', () => {
  render(
    <SelectField label="반" error="반을 선택해 주세요.">
      <option value="">반을 선택하세요</option>
    </SelectField>,
  )

  const select = screen.getByRole('combobox', { name: '반' })
  expect(select).toBeInvalid()
  expect(select).toHaveAccessibleDescription('반을 선택해 주세요.')
})
