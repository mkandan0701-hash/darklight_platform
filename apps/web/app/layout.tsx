import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess Academy Platform",
  description: "Diaspora chess academy management SaaS",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
