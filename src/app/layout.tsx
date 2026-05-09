import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SageX AI Universe",
  description: "SageX AI Universe - An immersive 3D shopping and AI tools experience with cosmic glassmorphism design.",
  keywords: ["SageX", "AI", "3D", "Shopping", "Universe", "React", "Three.js"],
  authors: [{ name: "SageX Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "SageX AI Universe",
    description: "An immersive 3D shopping and AI tools experience",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SageX AI Universe",
    description: "An immersive 3D shopping and AI tools experience",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`} style={{ background: '#000', margin: 0, padding: 0, overflow: 'hidden' }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
