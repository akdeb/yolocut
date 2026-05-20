/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent webpack from trying to bundle platform-specific compositor packages that
  // aren't installed on the current OS. Each platform only has its own package.
  serverExternalPackages: [
    "@remotion/compositor-darwin-arm64",
    "@remotion/compositor-darwin-x64",
    "@remotion/compositor-linux-x64-gnu",
    "@remotion/compositor-linux-x64-musl",
    "@remotion/compositor-linux-arm64-gnu",
    "@remotion/compositor-linux-arm64-musl",
    "@remotion/compositor-win32-x64-msvc",
  ],
  experimental: {
    // Next.js's file tracer (NFT) only follows JS imports, so it includes each
    // compositor package's index.js but skips the actual ffmpeg/ffprobe binaries.
    // These globs force those binaries into the Vercel serverless function bundle.
    outputFileTracingIncludes: {
      "/api/clip-trim": [
        "./node_modules/@remotion/compositor-linux-x64-gnu/**",
        "./node_modules/@remotion/compositor-linux-x64-musl/**",
        "./node_modules/@remotion/compositor-linux-arm64-gnu/**",
        "./node_modules/@remotion/compositor-linux-arm64-musl/**",
      ],
    },
  },
};

export default nextConfig;
