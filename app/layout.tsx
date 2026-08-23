import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaBootstrap } from "./PwaBootstrap";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = "北境自驾课｜挪威与冰岛交规学习";
  const description = "基于官方现行规则的挪威与冰岛自驾交规学习与离线题库。";
  return {
    metadataBase,
    title,
    description,
    icons: { icon: "/icon-192.png", shortcut: "/icon-192.png", apple: "/icon-192.png" },
    manifest: "/manifest.webmanifest",
    openGraph: { title, description, images: [new URL("/og.png", metadataBase).toString()], type: "website", locale: "zh_CN" },
    twitter: { card: "summary_large_image", title, description, images: [new URL("/og.png", metadataBase).toString()] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <PwaBootstrap />
        {children}
      </body>
    </html>
  );
}
