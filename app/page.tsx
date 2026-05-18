"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "../src/components/ui/button";

const Home = () => {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const isGruns = useMemo(() => username.trim().toLowerCase() === "gruns", [username]);

  const handleLogin = async () => {
    if (!isGruns || isLoggingIn) {
      return;
    }

    setIsLoggingIn(true);
    setError("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error("Invalid username or password");
      }

      router.push("/create");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <main className="flex h-full items-center justify-center overflow-hidden bg-[#f7f6f2] px-6 text-neutral-950">
      <section className="grid w-full max-w-sm justify-items-center gap-6">
        <Image
          src="/badger.png"
          alt="Yolocut"
          width={80}
          height={80}
          className="size-42 object-contain"
        />

        <div className="text-center">
          <h1 className="m-0 font-playfair text-6xl font-medium tracking-[-0.04em] mb-8">
            Yolocut
          </h1>
          <p className="m-0 mt-4 font-playfair text-lg font-semibold text-neutral-500">Get started</p>
        </div>

        <div className={isGruns ? "grid w-full max-w-xl gap-4" : "grid w-full max-w-sm gap-4"}>
          <div className="flex w-full flex-col items-center justify-center sm:flex-row">
            <div
              className={
                isGruns
                  ? "grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-emerald-100 bg-white opacity-100 shadow-sm transition-all duration-300 sm:size-28"
                  : "grid h-0 w-0 shrink-0 place-items-center overflow-hidden rounded-2xl border border-transparent bg-white opacity-0 transition-all duration-300 sm:h-28"
              }
            > 
              <Image src="/gruns.jpeg" alt="Gruns" width={112} height={112} className="size-full object-cover" />
            </div>

            <div
              className={
                isGruns
                  ? "grid w-full gap-3 transition-transform duration-300 sm:translate-x-2"
                  : "grid w-full translate-x-0 gap-3 transition-transform duration-300"
              }
            >
              <input
                className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-base font-normal outline-none shadow-sm placeholder:text-neutral-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="username"
                autoComplete="username"
              />
              <input
                className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-base font-normal outline-none shadow-sm placeholder:text-neutral-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="password"
                type="password"
                autoComplete="current-password"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleLogin();
                  }
                }}
              />
            </div>
          </div>

          <Button className="w-full font-playfair text-base" disabled={!isGruns || isLoggingIn} onClick={handleLogin}>
            {isLoggingIn ? "Logging in..." : "Login"}
          </Button>
        </div>

        {error ? <p className="m-0 text-sm font-semibold text-red-600">{error}</p> : null}
      </section>
    </main>
  );
};

export default Home;
