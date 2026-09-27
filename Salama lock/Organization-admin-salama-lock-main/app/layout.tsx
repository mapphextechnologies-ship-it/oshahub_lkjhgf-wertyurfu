import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salama Lock Organization Admin",
  description: "Organization workspace for Salama Lock Enterprise",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}