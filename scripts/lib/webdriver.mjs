import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const DEFAULT_BINARIES = {
  chromium: "/usr/bin/chromium",
  brave: "/usr/bin/brave",
  chrome: "/usr/bin/google-chrome",
  firefox: "/usr/bin/firefox",
  zen: "/usr/bin/zen-browser",
};

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function unusedPort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const port = server.address().port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

export function isFirefox(browser) {
  return browser === "firefox" || browser === "zen";
}

export class WebDriverSession {
  constructor({ browser, binary, driver, extension, headless = true, artifactDir, profile, preserveProfile = false }) {
    if (!(browser in DEFAULT_BINARIES)) {
      throw new Error(`Unknown browser: ${browser}`);
    }
    this.browser = browser;
    this.binary = binary ?? DEFAULT_BINARIES[browser];
    this.driverBinary = driver ?? (isFirefox(browser) ? "geckodriver" : "chromedriver");
    this.extension = extension ? resolve(extension) : null;
    this.headless = headless;
    this.artifactDir = artifactDir;
    this.profile = profile ? resolve(profile) : null;
    this.preserveProfile = preserveProfile;
    this.driverOutput = "";
  }

  async start() {
    this.profile ??= await mkdtemp(join(tmpdir(), `unloader-${this.browser}-`));
    await mkdir(this.profile, { recursive: true });
    this.port = await unusedPort();
    const driverArgs = [`--port=${this.port}`, ...(isFirefox(this.browser) ? ["--allow-system-access"] : [])];
    this.driverProcess = spawn(this.driverBinary, driverArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [this.driverProcess.stdout, this.driverProcess.stderr]) {
      stream.on("data", (chunk) => {
        this.driverOutput = (this.driverOutput + chunk.toString()).slice(-16000);
      });
    }

    try {
      await this.waitUntilReady();
      const firefox = isFirefox(this.browser);
      const args = firefox
        ? ["-profile", this.profile, ...(this.headless ? ["-headless"] : [])]
        : [
            `--user-data-dir=${this.profile}`,
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-networking",
            "--disable-sync",
            "--window-size=1440,900",
            ...(this.headless ? ["--headless=new"] : []),
            ...(this.extension
              ? [
                  `--load-extension=${this.extension}`,
                  `--disable-extensions-except=${this.extension}`,
                ]
              : []),
          ];
      const capabilities = firefox
        ? { browserName: "firefox", "moz:firefoxOptions": { binary: this.binary, args } }
        : { browserName: "chrome", "goog:chromeOptions": { binary: this.binary, args } };
      const response = await this.request("POST", "/session", {
        capabilities: { alwaysMatch: capabilities },
      }, 90000);
      this.sessionId = response.sessionId;
      this.capabilities = response.capabilities;
      if (!this.sessionId) throw new Error("WebDriver did not return a session ID.");
      if (firefox && this.extension) await this.installFirefoxAddon();
      return this;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async waitUntilReady() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (this.driverProcess.exitCode !== null) {
        throw new Error(`${this.driverBinary} exited early:\n${this.driverOutput}`);
      }
      try {
        await this.request("GET", "/status", undefined, 1000);
        return;
      } catch {
        await delay(100);
      }
    }
    throw new Error(`Timed out starting ${this.driverBinary}:\n${this.driverOutput}`);
  }

  async request(method, path, body, timeoutMs = 30000) {
    const response = await fetch(`http://127.0.0.1:${this.port}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const envelope = await response.json();
    if (!response.ok) {
      throw new Error(
        `WebDriver ${method} ${path}: ${envelope.value?.message ?? JSON.stringify(envelope.value)}`,
      );
    }
    return envelope.value;
  }

  command(method, suffix, body, timeoutMs) {
    return this.request(method, `/session/${this.sessionId}${suffix}`, body, timeoutMs);
  }

  navigate(url) {
    return this.command("POST", "/url", { url }, 90000);
  }

  execute(script, args = []) {
    return this.command("POST", "/execute/sync", { script, args }, 60000);
  }

  executeAsync(script, args = []) {
    return this.command("POST", "/execute/async", { script, args }, 60000);
  }

  async waitFor(predicate, label, timeoutMs = 15000) {
    const start = Date.now();
    let lastError;
    while (Date.now() - start < timeoutMs) {
      try {
        const result = await predicate();
        if (result) return result;
      } catch (error) {
        lastError = error;
      }
      await delay(200);
    }
    throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
  }

  async newTab(url) {
    const { handle } = await this.command("POST", "/window/new", { type: "tab" });
    await this.command("POST", "/window", { handle });
    await this.navigate(url);
    return handle;
  }

  getWindowHandle() {
    return this.command("GET", "/window");
  }

  switchWindow(handle) {
    return this.command("POST", "/window", { handle });
  }

  getWindowHandles() {
    return this.command("GET", "/window/handles");
  }

  async screenshot(path) {
    const base64 = await this.command("GET", "/screenshot");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, Buffer.from(base64, "base64"));
  }

  cdp(command, params = {}) {
    if (isFirefox(this.browser)) throw new Error("CDP is only available for Chromium browsers.");
    return this.command("POST", "/goog/cdp/execute", { cmd: command, params });
  }

  async extensionId() {
    if (isFirefox(this.browser)) {
      throw new Error("Dashboard URL discovery for Firefox requires a known extension UUID.");
    }
    return this.waitFor(async () => {
      const candidates = [join(this.profile, "Default", "Preferences"), join(this.profile, "Preferences")];
      for (const preferencesPath of candidates) {
        try {
          const preferences = JSON.parse(await readFile(preferencesPath, "utf8"));
          for (const [id, entry] of Object.entries(preferences.extensions?.settings ?? {})) {
            if (entry.path === this.extension || entry.manifest?.name === "Unloader") return id;
          }
        } catch {
          // Chromium writes Preferences asynchronously during startup.
        }
      }
      try {
        const { targetInfos } = await this.cdp("Target.getTargets");
        const target = targetInfos.find((item) =>
          item.url?.startsWith("chrome-extension://") &&
          (item.type === "service_worker" || item.type === "background_page"),
        );
        if (target) return new URL(target.url).hostname;
      } catch {
        // Some browsers restrict extension targets to the profile's Preferences file.
      }
      return null;
    }, "extension ID", 30000);
  }

  async installFirefoxAddon() {
    const manifestPath = join(this.extension, "manifest.json");
    await readFile(manifestPath, "utf8");
    const archivePath = join(this.profile, "unloader.xpi");
    const zip = spawnSync("zip", ["-q", "-r", archivePath, "."], {
      cwd: this.extension,
      encoding: "utf8",
    });
    if (zip.status !== 0) throw new Error(`zip failed: ${zip.stderr}`);
    this.firefoxAddonId = await this.command("POST", "/moz/addon/install", {
      path: archivePath,
      temporary: true,
    });
  }

  async firefoxExtensionOrigin() {
    const id = this.firefoxAddonId;
    return this.waitFor(async () => {
      for (const file of [join(this.profile, "prefs.js"), join(this.profile, "user.js")]) {
        try {
          const source = await readFile(file, "utf8");
          const line = source.split("\n").find((part) => part.includes("extensions.webextensions.uuids"));
          if (!line) continue;
          const encoded = line.match(/user_pref\("extensions\.webextensions\.uuids",\s*("(?:\\.|[^"\\])*")\)/)?.[1];
          if (!encoded) continue;
          const mapping = JSON.parse(JSON.parse(encoded));
          if (mapping[id]) return `moz-extension://${mapping[id]}`;
        } catch {
          // Firefox may still be writing the profile.
        }
      }
      return null;
    }, "Firefox extension UUID", 15000);
  }

  async stop() {
    if (this.sessionId) {
      try {
        await this.request("DELETE", `/session/${this.sessionId}`, undefined, 10000);
      } catch {
        // Always clean up the isolated profile even if the browser crashed.
      }
      this.sessionId = undefined;
    }
    if (this.driverProcess && this.driverProcess.exitCode === null) {
      this.driverProcess.kill("SIGTERM");
      await Promise.race([
        new Promise((resolvePromise) => this.driverProcess.once("exit", resolvePromise)),
        delay(2000),
      ]);
      if (this.driverProcess.exitCode === null) this.driverProcess.kill("SIGKILL");
    }
    if (this.profile && !this.preserveProfile) {
      await rm(this.profile, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const [name, inlineValue] = arg.slice(2).split("=", 2);
    if (name === "headed" || name === "help") {
      options[name] = true;
    } else {
      options[name] = inlineValue ?? argv[++index];
      if (options[name] === undefined) throw new Error(`Missing value for --${name}`);
    }
  }
  return options;
}

export async function profileProcessIds(driverPid) {
  const entries = await readdir("/proc");
  const children = new Map();
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const status = await readFile(`/proc/${entry}/status`, "utf8");
      const parent = Number(status.match(/^PPid:\s+(\d+)/m)?.[1]);
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(Number(entry));
    } catch {
      // Process ended while scanning.
    }
  }
  const found = [];
  const queue = [...(children.get(driverPid) ?? [])];
  while (queue.length) {
    const pid = queue.pop();
    found.push(pid);
    queue.push(...(children.get(pid) ?? []));
  }
  return found;
}

export async function linuxProcessSample(driverPid) {
  const pids = await profileProcessIds(driverPid);
  let pssKiB = 0;
  let cpuTicks = 0;
  let readable = 0;
  for (const pid of pids) {
    try {
      const [rollup, stat] = await Promise.all([
        readFile(`/proc/${pid}/smaps_rollup`, "utf8"),
        readFile(`/proc/${pid}/stat`, "utf8"),
      ]);
      pssKiB += Number(rollup.match(/^Pss:\s+(\d+) kB$/m)?.[1] ?? 0);
      const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
      cpuTicks += Number(fields[11]) + Number(fields[12]);
      readable += 1;
    } catch {
      // Process ended during sampling.
    }
  }
  if (readable === 0) throw new Error("No readable browser processes were found below WebDriver.");
  return { pssKiB, cpuTicks, processes: readable, measuredAt: Date.now() };
}

export function clockTicksPerSecond() {
  const result = spawnSync("getconf", ["CLK_TCK"], { encoding: "utf8" });
  const ticks = Number(result.stdout.trim());
  if (result.status !== 0 || !Number.isFinite(ticks) || ticks <= 0) {
    throw new Error("Could not determine Linux clock ticks per second.");
  }
  return ticks;
}
