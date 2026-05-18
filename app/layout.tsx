import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yolocut",
  description: "Create captioned video edits from briefs and B-roll.",
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <html lang="en">
      <body className="m-0 h-screen overflow-hidden bg-[#f7f6f2] font-sans text-neutral-950">
        {children}
      </body>
    </html>
  );
};

export default RootLayout;
