import { spawn } from "node:child_process";
import path from "node:path";

const localBin = (name) => path.join(process.cwd(), "node_modules", ".bin", name);

const children = {
  captions: spawn(process.execPath, ["caption-server.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
  }),
  studio: spawn(localBin("remotion"), ["studio"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      REMOTION_STUDIO_PORT: "3002",
    },
  }),
};

const shutdown = (code = 0) => {
  for (const child of Object.values(children)) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  process.exit(code);
};

children.captions.on("error", (error) => {
  console.error(error);
  shutdown(1);
});

children.captions.on("exit", (code, signal) => {
  if (signal) {
    shutdown(0);
    return;
  }

  shutdown(code ?? 0);
});

children.studio.on("error", (error) => {
  console.error(error);
  shutdown(1);
});

children.studio.on("exit", (code, signal) => {
  if (signal) {
    shutdown(0);
    return;
  }

  if (code === 0) {
    console.log("Remotion Studio is already running. Caption server is still active.");
    return;
  }

  shutdown(code ?? 1);
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
