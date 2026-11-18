import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  className = '',
  children,
  ...rest
}: Props) {
  const base =
    'inline-flex items-center justify-center rounded-arena px-5 py-4 text-lg font-semibold transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-brand text-bg hover:opacity-90 active:opacity-80',
    ghost: 'bg-surface-2 text-text hover:opacity-90 active:opacity-80',
  };
  const width = fullWidth ? 'w-full' : '';

  return (
    <button className={`${base} ${variants[variant]} ${width} ${className}`} {...rest}>
      {children}
    </button>
  );
}
