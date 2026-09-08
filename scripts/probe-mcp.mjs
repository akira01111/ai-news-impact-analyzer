// DIAGNOSTIC ONLY — read-only, no tools called, no auth.

const URL_MCP = "https://agent.binance.com/mcp/agentic";

const body = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: {
      name: "probe",
      version: "0.1.0",
    },
  },
});

async function attempt(label, extraHeaders) {
  console.log("\n===== " + label + " =====");

  try {
    const res = await fetch(URL_MCP, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...extraHeaders,
      },
      body,
    });

    console.log("HTTP status:", res.status, res.statusText);

    console.log("Response headers:");

    for (const [k, v] of res.headers.entries()) {
      console.log("   ", k + ":", v);
    }

    const text = await res.text();

    console.log("Body (first 1200 chars):");
    console.log(text.slice(0, 1200) || "(empty)");
  } catch (err) {
    console.log("FETCH THREW");
    console.log("name:   ", err?.name);
    console.log("message:", err?.message);
    console.log(
      "cause:  ",
      err?.cause?.message || err?.cause || "(none)"
    );
    console.log(
      "code:   ",
      err?.cause?.code || err?.code || "(none)"
    );
  }
}

await attempt("A: plain node fetch", {});

await attempt("B: with browser-like User-Agent", {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});