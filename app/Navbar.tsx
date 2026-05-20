"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { History } from "lucide-react";

type NavbarProps = {
  isAuthenticated: boolean;
};

export const Navbar = ({ isAuthenticated }: NavbarProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const isStudioRoute = pathname.startsWith("/studio/");

  if (isStudioRoute) {
    return null;
  }

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    router.push("/");
  };

  return (
    <nav className="relative flex h-14 shrink-0 items-center justify-between px-5 font-playfair text-sm font-semibold text-neutral-500">
      <button
        className="underline-offset-4 hover:text-neutral-950 hover:underline"
        type="button"
        onClick={() => router.push("/")}
      >
        Home
      </button>
      <div className="flex items-center gap-5">
        <button
          className="enabled:hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-40 mt-0.5"
          type="button"
          disabled={!isAuthenticated}
          onClick={() => router.push("/history")}
          aria-label="History"
        >
          <History className="size-4" />
        </button>
        <button
          className="underline-offset-4 enabled:hover:text-neutral-950 enabled:hover:underline disabled:cursor-not-allowed disabled:opacity-40"
          type="button"
          disabled={!isAuthenticated}
          onClick={() => {
            if (window.location.pathname === "/create") {
              window.dispatchEvent(new Event("yolocut:create"));
              return;
            }

            router.push("/create");
          }}
        >
          Create
        </button>
        <button
          className="underline-offset-4 hover:text-neutral-950 hover:underline"
          type="button"
          onClick={() => {
            if (!isAuthenticated) {
              router.push("/");
              return;
            }

            void handleLogout();
          }}
        >
          {isAuthenticated ? "Logout" : "Login"}
        </button>
        {isAuthenticated ? (
          <Image
            src="/gruns.png"
            alt="Grüns"
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-md object-contain"
          />
        ) : null}
      </div>
    </nav>
  );
};
