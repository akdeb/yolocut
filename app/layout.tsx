import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Playfair_Display } from "next/font/google";
import { Navbar } from "./Navbar";
import { Providers } from "./Providers";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "Yolocut",
  description: "Create captioned video edits from briefs and B-roll.",
};

const SESSION_COOKIE = "yolocut_session";

const RootLayout = async ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get(SESSION_COOKIE)?.value === "gruns";

  return (
    <html lang="en">
      <body
        className={`${playfair.variable} m-0 grid h-screen grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[#f7f6f2] font-sans text-neutral-950`}
      >
        <Providers>
          <Navbar isAuthenticated={isAuthenticated} />
          <div className="min-h-0">{children}</div>
        </Providers>
      </body>
    </html>
  );
};

export default RootLayout;
