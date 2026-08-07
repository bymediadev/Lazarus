/**
 * HTTPS fetch that includes NODE_EXTRA_CA_CERTS / windows-extra-cas.pem.
 * Node's default fetch can still fail corporate MITM TLS on Windows even with --use-system-ca.
 */
import { readFileSync, existsSync } from "fs";
import https from "https";
import { join } from "path";
import tls from "tls";
import { URL } from "url";

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

export async function secureFetch(
  input: string | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === "string" ? new URL(input) : input;
  if (url.protocol !== "https:") {
    return fetch(input, init);
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

  try {
    return await new Promise<Response>((resolve, reject) => {
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
            resolve(
              new Response(buf, {
                status: res.statusCode ?? 500,
                statusText: res.statusMessage,
                headers: responseHeaders,
              })
            );
          });
        }
      );
      req.on("error", reject);
      if (body != null) req.write(body);
      req.end();
    });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    if (/certificate|TLS|SSL|UNABLE_TO_VERIFY/i.test(cause)) {
      console.warn("[secureFetch] TLS with extra CA failed, retrying default fetch:", cause);
      return fetch(input, init);
    }
    throw err;
  }
}
