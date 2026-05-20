/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next.js's file tracer (NFT) follows JS imports but skips binary files.
    // This forces the ffmpeg-static binary into the Vercel serverless function bundle.
    outputFileTracingIncludes: {
      "/api/clip-trim": ["./node_modules/ffmpeg-static/**"],
    },
  },
};

export default nextConfig;
