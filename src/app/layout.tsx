import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { CookieBanner } from "@/components/consent/CookieBanner";
import { GoogleAnalytics } from "@/components/consent/GoogleAnalytics";

export const metadata: Metadata = {
  metadataBase: new URL("https://versioncontrol.gr"),
  title: {
    default: "VersionControl.gr — Learn Git, using Git",
    template: "%s — VersionControl.gr",
  },
  description:
    "Free interactive Git lessons. Real commands in a real terminal, with branches and commits drawn as you go. Nothing to install.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "VersionControl.gr",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <CookieBanner />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
