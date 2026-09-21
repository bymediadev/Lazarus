/**
 * HTTPS fetch that includes NODE_EXTRA_CA_CERTS / windows-extra-cas.pem.
 * Node's default fetch can still fail corporate MITM TLS on Windows even with --use-system-ca.
 */
import { readFileSync, existsSync } from "fs";
import https from "https";
import { join } from "path";
import tls from "tls";
import { URL } from "url";

export type SecureFetchInit = RequestInit & { timeoutMs?: number };

function loadExtraCaPem(): string | null {
  const fromEnv = (process.env.NODE_EXTRA_CA_CERTS ?? "").trim();
  if (fromEnv && existsSync(fromEnv)) {
    try {
      return readFileSync(fromEnv, "utf8");
    } catch {
      return null;
    }
  }
  const local = join(process.cwd(), "windows-extra-cas.pem");
  if (existsSync(local)) {
    try {
      return readFileSync(local, "utf8");
    } catch {
      return null;
    }
  }
  return null;
}

function buildAgent(): https.Agent {
  const extra = loadExtraCaPem();
  const ca = extra ? [extra, ...tls.rootCertificates] : [...tls.rootCertificates];
  return new https.Agent({ ca, keepAlive: true });
}

let agent: https.Agent | null = null;

function getAgent(): https.Agent {
  if (!agent) agent = buildAgent();
  return agent;
}

function fetchInit(init?: SecureFetchInit): RequestInit {
  if (!init) return {};
  const { timeoutMs: _timeoutMs, ...rest } = init;
  return rest;
}

function withTimeoutSignal(init?: SecureFetchInit): RequestInit {
  const base = fetchInit(init);
  const timeoutMs = init?.timeoutMs;
  if (!timeoutMs || timeoutMs <= 0 || base.signal) return base;
  return { ...base, signal: AbortSignal.timeout(timeoutMs) };
}

export async function secureFetch(
  input: string | URL,
  init?: SecureFetchInit
): Promise<Response> {
  const url = typeof input === "string" ? new URL(input) : input;
  if (url.protocol !== "https:") {
    return fetch(input, withTimeoutSignal(init));
  }

  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  const bodyInit = init?.body;
  const body =
    bodyInit == null
      ? undefined
      : typeof bodyInit === "string" || Buffer.isBuffer(bodyInit)
        ? bodyInit
        : String(bodyInit);
  const timeoutMs = init?.timeoutMs;
  const signal = init?.signal;

  try {
    return await new Promise<Response>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        fn();
      };

      const req = https.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          method,
          headers: Object.fromEntries(headers.entries()),
          agent: getAgent(),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            const responseHeaders = new Headers();
            for (const [k, v] of Object.entries(res.headers)) {
              if (v == null) continue;
              if (Array.isArray(v)) v.forEach((item) => responseHeaders.append(k, item));
              else responseHeaders.set(k, v);
            }
            finish(() =>
              resolve(
                new Response(buf, {
                  status: res.statusCode ?? 500,
                  statusText: res.statusMessage,
                  headers: responseHeaders,
                })
              )
            );
          });
          res.on("error", (err) => finish(() => reject(err)));
        }
      );

      const onAbort = () => {
        req.destroy();
        finish(() => reject(new Error("aborted")));
      };

      const onTimeout = () => {
        req.destroy();
        finish(() => reject(new Error("ETIMEDOUT")));
      };

      if (timeoutMs && timeoutMs > 0) {
        timer = setTimeout(onTimeout, timeoutMs);
      }

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      req.on("error", (err) => finish(() => reject(err)));
      if (body != null) req.write(body);
      req.end();
    });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    if (/certificate|TLS|SSL|UNABLE_TO_VERIFY/i.test(cause)) {
      console.warn("[secureFetch] TLS with extra CA failed, retrying default fetch:", cause);
      return fetch(input, withTimeoutSignal(init));
    }
    throw err;
  }
}
