import { cn } from '@/lib/cn'

/** Parent names render as given. A child is indented, lighter, and tied to the parent with a guide. */
export function CategoryName({
  depth,
  children,
  className,
}: {
  depth: number
  children: React.ReactNode
  className?: string
}) {
  if (depth <= 0) return <span className={className}>{children}</span>
  return (
    <span className={cn('relative flex min-h-5 min-w-0 items-center pl-5 text-[13px] font-normal text-muted-foreground', className)}>
      <span aria-hidden className="absolute inset-y-[-8px] left-1.5 w-px bg-muted-foreground/45" />
      <span aria-hidden className="absolute left-1.5 top-1/2 h-px w-3 -translate-y-px bg-muted-foreground/45" />
      <span className="min-w-0">{children}</span>
    </span>
  )
}
