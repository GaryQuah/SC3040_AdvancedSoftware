const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

async function main() {
  const frontend = path.resolve(__dirname, "..");
  const backend = path.resolve(frontend, "../backend");
  const python = process.env.DEMO_PYTHON || path.join(backend, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "fitra-demo-test-"));
  const processes = [];
  let logs = "";
  let browser;
  function start(command, args, cwd, env) {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", data => { logs += data; });
    child.stderr.on("data", data => { logs += data; });
    processes.push(child);
  }
  async function ready(url) {
    for (let i = 0; i < 90; i++) {
      if (processes.some(child => child.exitCode !== null)) throw new Error(logs);
      try { if ((await fetch(url)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`Server did not start: ${url}`);
  }
  try {
    start(python, ["-m", "uvicorn", "app.nutrition_demo:app", "--host", "127.0.0.1", "--port", "8118"], backend,
      { NUTRITION_DEMO_DB_PATH: path.join(temp, "meals.sqlite3"), ENVIRONMENT: "test", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", GOOGLE_GENERATIVE_AI_API_KEY: "" });
    await ready("http://127.0.0.1:8118/health");
    start(process.execPath, ["-e", "require('next/dist/server/lib/start-server').startServer({ dir: process.cwd(), isDev: true, port: 3118, hostname: '127.0.0.1', allowRetry: false })"], frontend,
      { NEXT_PUBLIC_NUTRITION_DEMO_MODE: "true", NEXT_PUBLIC_BACKEND_URL: "http://127.0.0.1:8118", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" });
    await ready("http://localhost:3118/dashboard/nutrition");
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const external = [];
    page.on("request", req => { if (/supabase|googleapis/.test(req.url())) external.push(req.url()); });
    await page.goto("http://localhost:3118/dashboard/nutrition");
    await page.getByRole("heading", { name: "Fuel your next best." }).waitFor();
    await page.getByText("A fresh plate, a fresh start.").waitFor();
    const fixture = spawnSync(python, ["-c", "import io,sys; from PIL import Image; b=io.BytesIO(); Image.new('RGB',(20,20),'green').save(b,format='PNG'); sys.stdout.buffer.write(b.getvalue())"], { windowsHide: true });
    assert.equal(fixture.status, 0);
    await page.getByLabel("Choose meal photo", { exact: true }).setInputFiles({ name: "meal.png", mimeType: "image/png", buffer: fixture.stdout });
    await page.getByRole("button", { name: "Analyze meal", exact: true }).click();
    await page.getByText(/SAMPLE DATA: This fixed result/).waitFor();
    await page.getByRole("button", { name: "Confirm & log meal" }).click();
    await page.getByText("Meal saved. Your daily totals have been updated.").waitFor();
    await page.reload();
    await page.locator("summary").filter({ hasText: "Sample chicken & rice bowl" }).click();
    const screenshot = path.join(frontend, ".next", "nutrition-qa", "local-demo.png");
    fs.mkdirSync(path.dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot, fullPage: true });
    await page.getByRole("button", { name: "Delete meal", exact: true }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await page.getByText("A fresh plate, a fresh start.").waitFor();
    assert.deepEqual(external, []);
    console.log("PASS: no-login demo, real local API, sample photo result, SQLite save, reload persistence, deletion, no Supabase/Gemini requests.");
  } catch (error) {
    console.error(logs.slice(-4000));
    throw error;
  } finally {
    await browser?.close();
    // The Windows Python venv launcher may create a separate interpreter process.
    const serverPids = [...logs.matchAll(/Started server process \[(\d+)\]/g)].map(match => Number(match[1]));
    for (const pid of new Set([...serverPids, ...processes.map(child => child.pid)])) {
      try { process.kill(pid); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    for (const child of processes) {
      child.stdout.destroy(); child.stderr.destroy(); child.unref();
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
