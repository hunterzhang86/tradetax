/** @type {import('next').NextConfig} */
const nextConfig = {
  // 纯静态导出: 零后端, 所有计算在浏览器本地完成 (隐私核心卖点)
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
