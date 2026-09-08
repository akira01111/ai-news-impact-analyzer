import express from "express";
import { setSnapshot } from "../services/marketStore.js";

const router = express.Router();

router.post("/api/mcp/webhook", (req, res) => {
  const auth = req.get("authorization") || "";

  const expected = process.env.WEBHOOK_SECRET
    ? `Bearer ${process.env.WEBHOOK_SECRET}`
    : null;

  if (!expected || auth !== expected) {
    return res.status(401).json({
      error: "unauthorized",
    });
  }

  const body = req.body ?? {};

  const symbol = String(
    body.symbol ||
      body.pair ||
      "BTCUSDT"
  ).toUpperCase();

  const price =
    body.price ??
    body.last ??
    body.lastPrice ??
    body.close;

  const change =
    body.change_24h ??
    body.priceChangePercent ??
    body.priceChange;

  const volume =
    body.volume ??
    body.quoteVolume ??
    body.volume_24h;

  if (
    price === undefined ||
    price === null
  ) {
    return res.status(400).json({
      error: "missing price",
    });
  }

  setSnapshot({
    symbol,
    price: String(price),
    change_24h: String(change ?? "0"),
    volume_24h: volume ?? 0,
  });

  return res.json({
    ok: true,
    symbol,
    source: "mcp",
  });
});

export default router;