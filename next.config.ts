/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
  images: {
    domains: ['https://ugddjyrvbmwpafgasjzp.supabase.co'], 
  },
  // Enable strict mode for development
  reactStrictMode: true,
}

export default nextConfig