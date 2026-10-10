import type { ButtonHTMLAttributes } from 'react'
import { buttonClassName, type ButtonStyleProps } from './buttonStyles'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleProps

export function Button({
  variant,
  size,
  block,
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, block }, className)}
      {...props}
    />
  )
}
