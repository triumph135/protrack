import { notFound } from 'next/navigation'
import ReportsApp from '@/components/reports/ReportsApp'
import { catalogItem } from '@/lib/reports/catalog'

export default async function ReportKeyPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>
  searchParams: Promise<{ range?: string; group?: string; per_project?: string }>
}) {
  const { key } = await params
  const query = await searchParams
  if (!catalogItem(key)) notFound()
  return (
    <ReportsApp
      mode="report"
      reportKey={key}
      initialRange={query.range}
      initialGroup={query.group}
      initialPerProject={query.per_project}
    />
  )
}
