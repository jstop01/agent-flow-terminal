/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  devIndicators: false,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/events',
        destination: 'http://127.0.0.1:3001/events',
      },
    ]
  },
}

export default nextConfig
