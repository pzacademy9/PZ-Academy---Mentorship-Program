/** @type {import('next').NextConfig} */
const nextConfig = {
  // jsdom (via isomorphic-dompurify) ships an ESM-only dependency
  // (html-encoding-sniffer -> @exodus/bytes/encoding-lite.js) that webpack's
  // bundling of server code can't resolve. Keeping it external leaves it as a
  // native `require` at runtime instead, which Node resolves fine.
  experimental: {
    serverComponentsExternalPackages: ["isomorphic-dompurify", "jsdom"],
  },
};

export default nextConfig;
