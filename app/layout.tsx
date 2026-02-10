import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BassBuddy (MVP)",
  description: "Browser-based sub placement coach for quick relative bass smoothness comparisons."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="appShell">{children}</div>
      </body>
    </html>
  );
}
