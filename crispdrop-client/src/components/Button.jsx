/**
 * components/Button.jsx — Branded button primitive
 *
 * Variants: primary, secondary, ghost, danger
 * Sizes: sm, md, lg
 */

import React from 'react';

const variantClasses = {
  primary: 'btn-primary',
  secondary:
    'inline-flex items-center justify-center gap-2 px-5 py-3 bg-indigo-50 text-indigo-600 font-semibold text-[0.9375rem] rounded-xl border border-indigo-100 cursor-pointer transition-all duration-200 hover:bg-indigo-100 hover:border-indigo-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed select-none',
  ghost:
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-gray-600 font-medium text-sm rounded-lg cursor-pointer transition-all duration-200 hover:bg-gray-100 hover:text-gray-900 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed select-none',
  danger:
    'inline-flex items-center justify-center gap-2 px-5 py-3 bg-danger-light text-danger font-semibold text-[0.9375rem] rounded-xl border border-red-100 cursor-pointer transition-all duration-200 hover:bg-red-100 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed select-none',
  outline:
    'inline-flex items-center justify-center gap-2 px-5 py-3 bg-transparent text-indigo-600 font-semibold text-[0.9375rem] rounded-xl border-2 border-indigo-300 cursor-pointer transition-all duration-200 hover:bg-indigo-50 hover:border-indigo-400 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed select-none',
};

const sizeClasses = {
  sm: '!px-3 !py-2 !text-sm !rounded-lg',
  md: '',
  lg: '!px-7 !py-4 !text-base !rounded-2xl',
};

const LoadingSpinner = () => (
  <svg
    className="animate-spin-slow"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
  </svg>
);

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  id,
  className = '',
  onClick,
  type = 'button',
  ...rest
}) {
  const classes = [
    variantClasses[variant] || variantClasses.primary,
    sizeClasses[size] || '',
    fullWidth ? '!w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      id={id}
      type={type}
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
      aria-busy={loading}
      {...rest}
    >
      {loading && <LoadingSpinner />}
      {!loading && icon && iconPosition === 'left' && (
        <span className="flex-shrink-0">{icon}</span>
      )}
      {children}
      {!loading && icon && iconPosition === 'right' && (
        <span className="flex-shrink-0">{icon}</span>
      )}
    </button>
  );
}
