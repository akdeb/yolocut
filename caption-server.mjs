import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const port = Number(process.env.CAPTION_SERVER_PORT ?? 3001);

let running = null;

const send = (res, statusCode, body) => {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(body));
};

const getCaptionScript = () => {
  const finalAudioPath = path.join(process.cwd(), ".yolocut", "final-audio.mp3");

  return existsSync(finalAudioPath) ? "transcribe-final-audio.mjs" : "sub.mjs";
};

const runCaptionScript = () => {
  if (running) {
    return running;
  }

  running = new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [getCaptionScript()], {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Caption process exited with code ${code}`));
    });
  }).finally(() => {
    running = null;
  });

  return running;
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, {});
    return;
  }

  if (req.method === "GET" && req.url === "/healthz") {
    send(res, 200, { ok: true, running: Boolean(running) });
    return;
  }

  if (req.method === "POST" && req.url === "/caption-timeline") {
    try {
      await runCaptionScript();
      send(res, 200, { ok: true });
    } catch (error) {
      send(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : "Captioning failed",
      });
    }
    return;
  }

  send(res, 404, { ok: false, error: "Not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Caption server ready on http://127.0.0.1:${port}`);
});
