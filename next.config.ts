/** @type {import('next').NextConfig} */

// Production stays allowed even when a preview build points NEXT_PUBLIC_SUPABASE_URL
// at another project. Attachment images are optimized from that project's storage host.
const PRODUCTION_SUPABASE_HOST = 'cqocddiracijeccswqzz.supabase.co'

function supabaseImagePatterns(): NonNullable<import('next').NextConfig['images']>['remotePatterns'] {
  const patterns: NonNullable<import('next').NextConfig['images']>['remotePatterns'] = [
    {
      protocol: 'https',
      hostname: PRODUCTION_SUPABASE_HOST,
      pathname: '/storage/v1/object/**',
    },
  ]
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return patterns
  try {
    const url = new URL(raw)
    const protocol = url.protocol === 'http:' ? 'http' : url.protocol === 'https:' ? 'https' : null
    if (!protocol || !url.hostname) return patterns
    const alreadyListed = patterns.some((pattern) => pattern.hostname === url.hostname && pattern.protocol === protocol)
    if (!alreadyListed) {
      patterns.push({
        protocol,
        hostname: url.hostname,
        ...(url.port ? { port: url.port } : {}),
        pathname: '/storage/v1/object/**',
      })
    }
  } catch {
    // A bad URL must not drop the production host.
  }
  return patterns
}

const nextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: supabaseImagePatterns(),
  },
  reactStrictMode: true,
  
  // Production optimizations
  output: 'standalone',
  
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
    ]
  },
}

export default nextConfig