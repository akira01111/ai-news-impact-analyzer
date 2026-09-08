/**
 * TEMPORARY DISCOVERY SCRIPT — read-only.
 * Connects to the public Binance MCP server, lists available tools,
 * and tries one market-data call for BTCUSDT.
 *
 * It NEVER calls trading/account tools.
 * Delete this file once the real client is implemented (or keep as debug aid).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL =
  process.env.MCP_BASE_URL || "https://agent.binance.com/mcp/agentic";

// Only these tool names are allowed to be CALLED by this script.
const MARKET_DATA_ALLOWLIST = [
  "get_24hr_ticker",
  "get_price",
  "get_klines",
  "get_orderbook",
];

function line(title: string) {
  console.log("\n" + "=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
}

async function main() {
  console.log("Connecting to MCP server:", MCP_URL);

  const client = new Client({
    name: "ai-news-impact-analyzer-inspector",
    version: "0.1.0",
  });

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));

  await client.connect(transport);
  console.log("Connected OK.");

  // ---------- 1. LIST ALL TOOLS ----------
  line("1. TOOL LIST");

  const toolsResult: any = await client.listTools();
  const tools: any[] = toolsResult?.tools ?? [];

  console.log("Total tools exposed:", tools.length);
  console.log("");

  for (const t of tools) {
    console.log("- " + t.name);

    if (t.description) {
      console.log(
        "    desc: " + String(t.description).slice(0, 160)
      );
    }
  }

  // ---------- 2. SCHEMAS OF MARKET DATA TOOLS ONLY ----------
  line("2. INPUT SCHEMAS (market-data tools only)");

  const marketTools = tools.filter((t) =>
    MARKET_DATA_ALLOWLIST.includes(t.name)
  );

  if (marketTools.length === 0) {
    console.log(
      "None of the expected market-data tool names were found."
    );
    console.log(
      "Look at the full tool list above and tell Mira the real names."
    );
  }

  for (const t of marketTools) {
    console.log("\n### " + t.name);
    console.log(JSON.stringify(t.inputSchema, null, 2));
  }

  // ---------- 3. TEST CALL: 24h TICKER FOR BTCUSDT ----------
  line("3. TEST CALL");

  const tickerTool =
    marketTools.find((t) => t.name === "get_24hr_ticker") ||
    marketTools.find((t) => t.name === "get_price");

  if (!tickerTool) {
    console.log("No ticker tool available to test. Skipping.");
  } else {
    console.log(
      "Calling tool:",
      tickerTool.name,
      "with { symbol: 'BTCUSDT' }"
    );

    try {
      const result: any = await client.callTool({
        name: tickerTool.name,
        arguments: { symbol: "BTCUSDT" },
      });

      console.log("\nisError:", result?.isError === true);

      console.log("\n--- RAW RESULT ---");
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.log("\nCall FAILED.");

      console.log(
        "Message:",
        err?.message || String(err)
      );

      console.log(
        "\n(If this says the argument is invalid, copy the schema from section 2 above.)"
      );
    }
  }

  line("DONE");

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(
    "\nFATAL:",
    err?.message || err
  );

  console.error(
    "\nIf this is an import error, tell Mira the exact message — the SDK may use different import paths in your installed version."
  );

  process.exit(1);
});