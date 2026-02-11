import type { Metadata } from "next";
import { AppBrand } from "@/components/AppBrand";
import "./globals.css";

export const metadata: Metadata = {
  title: "BassBuddy (MVP)",
  description: "Browser-based sub placement coach for quick relative bass smoothness comparisons."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="appShell">
          <header className="appBrandBar">
            <AppBrand priority />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
