import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * 커스텀 Tailwind 테마를 인식하는 twMerge 설정
 *
 * 프로젝트의 커스텀 색상, 간격, 폰트 크기를 정의하여
 * twMerge가 충돌하는 클래스를 올바르게 병합할 수 있게 합니다.
 */
const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // 커스텀 폰트 크기 인식
      'font-size': [{ text: ['xxs', 'xs', 'sm', 'base', 'lg'] }],
    },
    theme: {
      // 커스텀 색상 인식 (viewer, accent, text, border 계열)
      colors: [
        'viewer-bg',
        'viewer-surface',
        'viewer-surface-alt',
        'viewer-panel',
        'accent-primary',
        'accent-secondary',
        'accent-success',
        'accent-warning',
        'accent-error',
        'accent-info',
        'text-primary',
        'text-secondary',
        'text-muted',
        'text-disabled',
        'border-active',
        'border-selected',
        'border-hover',
      ],
      // 커스텀 간격 인식 (이미 Tailwind 기본과 겹치므로 별도 추가 불필요)
    },
  },
})

/**
 * cn() - 조건부 클래스 병합 유틸리티
 *
 * clsx로 조건부 클래스를 처리하고,
 * tailwind-merge로 충돌하는 유틸리티를 병합합니다.
 *
 * @example
 * ```tsx
 * cn('px-4 py-2', isActive && 'bg-accent-primary', className)
 * cn('text-white', disabled ? 'text-text-disabled' : 'text-text-primary')
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs))
}
