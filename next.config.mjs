/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "@remotion/renderer",
    "@remotion/compositor-darwin-arm64",
    "@remotion/compositor-darwin-x64",
    "@remotion/compositor-linux-x64-gnu",
    "@remotion/compositor-linux-x64-musl",
    "@remotion/compositor-linux-arm64-gnu",
    "@remotion/compositor-linux-arm64-musl",
    "@remotion/compositor-win32-x64-msvc",
  ],
  experimental: {
    // NFT (Next.js file tracer) only follows JS imports, so it includes the
    // compositor package's index.js but skips the actual ffmpeg/ffprobe binaries.
    // These globs force them into the serverless function bundle.
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
