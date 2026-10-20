import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tidewater",
  description: "A lightweight CRM for small agencies.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
