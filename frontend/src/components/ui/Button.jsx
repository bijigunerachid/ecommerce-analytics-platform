import { buttonClass } from './button-styles.js';

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}
