import { Link, type LinkProps } from 'react-router'
import { buttonClassName, type ButtonStyleProps } from './buttonStyles'

type ButtonLinkProps = LinkProps & ButtonStyleProps

/** 버튼처럼 보이는 링크. 누르면 다른 화면으로 이동할 때 쓴다. (동작을 실행할 때는 `Button`) */
export function ButtonLink({ variant, size, block, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClassName({ variant, size, block }, className)} {...props} />
}
