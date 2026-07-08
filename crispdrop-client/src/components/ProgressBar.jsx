/**
 * components/ProgressBar.jsx — Animated progress bar with label and percentage
 */

import React from 'react';
import { formatBytes } from '../utils/chunker';

export function ProgressBar({
  progress = 0,            // 0 to 1
  bytesSent = 0,
  totalBytes = 0,
  label,
  showBytes = true,
  showPercentage = true,
  size = 'md',
  color = 'indigo',
  animated = true,
  className = '',
}) {
  const pct = Math.min(Math.max(Math.round(progress * 100), 0), 100);

  const heights = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' };
  const heightClass = heights[size] || heights.md;

  const colorMap = {
    indigo: 'from-indigo-500 to-indigo-400',
    green: 'from-emerald-500 to-emerald-400',
    amber: 'from-amber-500 to-amber-400',
    red: 'from-red-500 to-red-400',
  };
  const colorClass = colorMap[color] || colorMap.indigo;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {(label || showPercentage || showBytes) && (
        <div className="flex items-center justify-between gap-4">
          {label && (
            <span className="text-sm font-medium text-gray-700 truncate max-w-[60%]">
              {label}
            </span>
          )}
          <div className="flex items-center gap-3 ml-auto text-xs text-gray-500 font-mono">
            {showBytes && totalBytes > 0 && (
              <span>
                {formatBytes(bytesSent)} / {formatBytes(totalBytes)}
              </span>
            )}
            {showPercentage && (
              <span className="font-semibold text-indigo-600 text-sm tabular-nums">
                {pct}%
              </span>
            )}
          </div>
        </div>
      )}

      <div className={`w-full ${heightClass} bg-gray-100 rounded-full overflow-hidden`}>
        <div
          className={`h-full rounded-full bg-gradient-to-r ${colorClass} relative overflow-hidden transition-[width] duration-150 ease-out`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label || 'Progress'}
        >
          {animated && pct > 0 && pct < 100 && (
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              style={{
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s linear infinite',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
