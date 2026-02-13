// app/layout.js
import { Geist, Geist_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import Footer from "@/components/Footer";

const pixel = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

const geistSans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata = {
  title: "rccolamachine",
  description: "Rob’s personal site for photos, projects, and experiments.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pixel.variable}`}
      >
        <div className="crtOverlay" aria-hidden="true" />{" "}
        <div className="shell">
          <SiteHeader />
          <main className="main">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
