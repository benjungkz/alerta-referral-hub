import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alerta Referral Hub",
  description: "Referral redirect hub for Alerta Home.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
