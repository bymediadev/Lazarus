import { execSync } from "node:child_process";

const ports = [3001, 5173, 5174, 5175, 5176];
const pids = new Set();

if (process.platform === "win32") {
  for (const port of ports) {
    try {
      const out = execSync(`netstat -ano | findstr ":${port} "`, { encoding: "utf8" });
      for (const line of out.split(/\r?\n/)) {
        const m = line.trim().match(/\s(\d+)\s*$/);
        if (m) pids.add(m[1]);
      }
    } catch {
      /* no listeners on port */
    }
  }
  for (const pid of pids) {
    if (pid === "0") continue;
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      console.log(`Stopped PID ${pid}`);
    } catch {
      /* already gone */
    }
  }
} else {
  for (const port of ports) {
    try {
      execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { shell: true, stdio: "ignore" });
    } catch {
      /* none */
    }
  }
}

console.log("Port cleanup done. Run: npm run dev");
