import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tidewater",
  description: "A lightweight CRM for small agencies.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading request headers makes every page dynamically rendered, which the
  // nonce-based CSP requires (a static page can't carry a per-request nonce).
  await headers();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
