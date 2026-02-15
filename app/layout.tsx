import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Debate — Claude vs GPT-4o vs Gemini",
  description: "Multi-AI debate platform: compare answers from Claude, GPT-4o, and Gemini side by side",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
