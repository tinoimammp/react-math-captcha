import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the local source of `react-math-captcha` so that its
  // `.js`-suffixed ESM relative imports work in both dev and `next build`.
  transpilePackages: ["react-math-captcha"],
};

export default nextConfig;
