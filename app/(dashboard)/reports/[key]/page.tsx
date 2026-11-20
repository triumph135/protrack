import { notFound } from 'next/navigation'
import ReportsApp from '@/components/reports/ReportsApp'
import { catalogItem } from '@/lib/reports/catalog'

export default async function ReportKeyPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!catalogItem(key)) notFound()
  return <ReportsApp mode="report" reportKey={key} />
}
