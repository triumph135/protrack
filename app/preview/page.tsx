import { notFound } from 'next/navigation'
import PreviewGallery from '@/components/preview/PreviewGallery'

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string; width?: string; bare?: string }>
}) {
  if (process.env.NEXT_PUBLIC_SCREENSHOTS !== '1') notFound()
  const params = await searchParams
  return (
    <PreviewGallery
      initialScreen={params.screen}
      initialMobile={params.width === 'mobile'}
      bare={params.bare === '1'}
    />
  )
}
