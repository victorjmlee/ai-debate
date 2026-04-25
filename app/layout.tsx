import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Providers from "./components/session-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Debate — Claude vs GPT vs Gemini",
  description: "Multi-AI debate platform: compare answers from Claude, GPT-5 Mini, and Gemini side by side",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          {children}
        </Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
