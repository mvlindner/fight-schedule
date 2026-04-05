import type { Metadata } from "next";
import "./globals.css";
import TransitionMount from "@/components/TransitionMount";

export const metadata: Metadata = {
  title: "fight-schedule",
  description: "Minimal fight schedule for Boxing and MMA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="no-top-fade no-transition min-h-full flex flex-col">
        <TransitionMount />
        {children}
      </body>
    </html>
  );
}
