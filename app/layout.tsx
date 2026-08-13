import type { Metadata } from "next";
import Script from "next/script";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TradeTax · 港美股投资个税计算器",
  description:
    "上传富途/老虎/长桥交易账单, 本地自动计算资本利得税、股息税与利息税。100% 浏览器本地计算, 数据不出设备。",
  keywords: [
    "港股税务计算",
    "美股税务计算",
    "富途报税",
    "老虎证券报税",
    "长桥报税",
    "资本利得税",
    "CRS申报",
    "境外收入个税",
  ],
  openGraph: {
    title: "TradeTax · 港美股投资个税计算器",
    description: "富途/老虎/长桥交易账单 → 本地计算个税, 数据不出浏览器。",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "TradeTax 港美股投资个税计算器" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TradeTax · 港美股投资个税计算器",
    description: "富途/老虎/长桥交易账单 → 本地计算个税, 数据不出浏览器。",
    images: ["/og.png"],
  },
};

const adsenseClientId = process.env.GOOGLE_ADSENSE_CLIENT_ID;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark">
      <head>
        {adsenseClientId && (
          <>
            <link rel="dns-prefetch" href="https://pagead2.googlesyndication.com" />
            <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossOrigin="anonymous" />
          </>
        )}
      </head>
      <body className={`${inter.variable} font-sans min-h-screen`}>
        {children}
        {adsenseClientId && (
          <Script
            async
            strategy="afterInteractive"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClientId}`}
            crossOrigin="anonymous"
          />
        )}
      </body>
      {process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS && (
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS} />
      )}
    </html>
  );
}
