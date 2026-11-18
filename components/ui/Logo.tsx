import { cn } from '@/lib/cn'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  sm: 'h-5',
  md: 'h-6',
  lg: 'h-8',
  xl: 'h-10',
}

export default function Logo({ size = 'md', className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-primary', sizes[size], className)}>
      <svg viewBox="0 0 24 24" className="h-full w-auto" aria-hidden="true">
        <rect x="3" y="13" width="4" height="8" rx="1" fill="currentColor" opacity="0.45" />
        <rect x="10" y="8" width="4" height="13" rx="1" fill="currentColor" opacity="0.7" />
        <rect x="17" y="3" width="4" height="18" rx="1" fill="currentColor" />
      </svg>
      <span className="text-[1.35em] font-semibold tracking-tight leading-none">ProTrack</span>
    </span>
  )
}
