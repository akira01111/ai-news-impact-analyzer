# MarketLens 

AI-powered real-time crypto news and market impact analyzer. Built for the **Binance Agent OS Mini Hackathon (Track B)**.

## What it does
- **Live Tickers:** Real-time data streams for crypto pairs (BTCUSDT, ETHUSDT) using Binance market feeds.
- **News Impact Analyzer:** Analyzes breaking news and maps sentiment shifts against live order book movements.
- **Clean UI:** Fast, lightweight web interface with a custom retro terminal look.
- **MCP Integration:** Uses Model Context Protocol to handle real-time telemetry and tool queries.

## Tech Stack
- TypeScript / Node.js / Express
- Vanilla JS & CSS
- Binance MCP Webhook

## Run Locally

```bash
git clone [https://github.com/akira01111/ai-news-impact-analyzer.git](https://github.com/akira01111/ai-news-impact-analyzer.git)
cd ai-news-impact-analyzer
npm install
npm run dev
