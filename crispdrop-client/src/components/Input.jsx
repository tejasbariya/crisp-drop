/**
 * components/Input.jsx — Branded form input primitive with label, hint, and error states
 */

import React, { forwardRef } from 'react';

export const Input = forwardRef(function Input(
  {
    id,
    label,
    hint,
    error,
    type = 'text',
    placeholder,
    value,
    onChange,
    disabled,
    prefix,
    suffix,
    className = '',
    required,
    ...rest
  },
  ref
) {
  const inputId = id || `input-${label?.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-gray-700 flex items-center gap-1"
        >
          {label}
          {required && <span className="text-indigo-500">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        {prefix && (
          <div className="absolute left-3 text-gray-400 pointer-events-none flex items-center">
            {prefix}
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          className={[
            'input-base',
            prefix ? 'pl-10' : '',
            suffix ? 'pr-10' : '',
            error ? '!border-red-400 !focus:ring-red-200' : '',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          aria-invalid={!!error}
          {...rest}
        />

        {suffix && (
          <div className="absolute right-3 text-gray-400 flex items-center">
            {suffix}
          </div>
        )}
      </div>

      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="text-xs text-red-500 font-medium flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0-4a1 1 0 0 1-1-1V8a1 1 0 0 1 2 0v3a1 1 0 0 1-1 1z" />
          </svg>
          {error}
        </p>
      )}

      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs text-gray-400">
          {hint}
        </p>
      )}
    </div>
  );
});
