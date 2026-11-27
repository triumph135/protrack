import ReportsApp from '@/components/reports/ReportsApp'

export default async function SavedReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ReportsApp mode="builder" reportKey="custom" definitionId={id} />
}
