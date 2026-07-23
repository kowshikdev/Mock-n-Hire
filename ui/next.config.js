/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  server: {
    allowedHosts: true,
    host: true,
  },
};

module.exports = nextConfig;
