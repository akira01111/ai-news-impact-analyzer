// src/server.ts

import "dotenv/config";

import express, {
  Request,
  Response,
} from "express";

import path from "path";

import {
  getSnapshot,
} from "./services/marketStore.js";

import mcpWebhook from "./routes/mcpWebhook.js";

import {
  analyzeNews,
  Snapshot,
} from "./services/analysis.js";


/* =====================================================
   APP
   ===================================================== */

const app = express();

const PORT =
  process.env.PORT
    ? Number(process.env.PORT)
    : 3000;


/* =====================================================
   ENV CHECK
   ===================================================== */

console.log(
  "WEBHOOK_SECRET loaded:",
  Boolean(
    process.env.WEBHOOK_SECRET
  ),
  process.env.WEBHOOK_SECRET ||
    "(missing)"
);

console.log(
  "OPENAI_API_KEY loaded:",
  Boolean(
    process.env.OPENAI_API_KEY
  )
);

console.log(
  "OPENAI_MODEL:",
  process.env.OPENAI_MODEL ||
    "gpt-5.6-luna"
);


/* =====================================================
   MIDDLEWARE
   ===================================================== */

app.use(
  express.json({
    limit: "1mb",
  })
);


const publicPath =
  path.join(
    __dirname,
    "..",
    "public"
  );


app.use(
  express.static(
    publicPath
  )
);


/* =====================================================
   ROOT
   ===================================================== */

app.get(
  "/",
  (_req: Request, res: Response) => {
    res.sendFile(
      path.join(
        publicPath,
        "index.html"
      )
    );
  }
);


/* =====================================================
   MCP WEBHOOK
   ===================================================== */

app.use(
  mcpWebhook
);


/* =====================================================
   GET MARKET SNAPSHOT
   ===================================================== */

app.get(
  "/api/market/snapshot",
  (
    req: Request,
    res: Response
  ) => {

    const requestedSymbol =
      String(
        req.query.symbol ||
          "BTCUSDT"
      ).toUpperCase();


    const snapshot =
      getSnapshot(
        requestedSymbol
      );


    if (!snapshot) {
      return res
        .status(404)
        .json({
          error:
            "market snapshot unavailable",

          symbol:
            requestedSymbol,

          source:
            "mcp",
        });
    }


    return res.json({
      symbol:
        snapshot.symbol,

      price:
        snapshot.price,

      change_24h:
        snapshot.change_24h,

      volume_24h:
        snapshot.volume_24h,

      source:
        "mcp",
    });
  }
);


/* =====================================================
   OPENAI API
   ===================================================== */

async function callOpenAI(
  messages: Array<{
    role:
      "user" |
      "assistant";

    content:
      string;
  }>,
  systemPrompt: string
): Promise<string> {

  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing"
    );
  }


  const model =
    process.env.OPENAI_MODEL ||
    "gpt-5.6-luna";


  const response =
    await fetch(
      "https://api.openai.com/v1/responses",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${apiKey}`,
        },

        body:
          JSON.stringify({
            model,

            instructions:
              systemPrompt,

            input:
              messages,

            max_output_tokens:
              1200,
          }),
      }
    );


  if (!response.ok) {

    let errorBody:
      unknown = null;

    try {
      errorBody =
        await response.json();
    } catch (_) {
      /* ignore */
    }


    let message =
      `OpenAI request failed with HTTP ${response.status}`;


    if (
      errorBody &&
      typeof errorBody ===
        "object" &&
      "error" in errorBody
    ) {

      const apiError =
        (
          errorBody as {
            error?: {
              message?: string;
            };
          }
        ).error;


      if (
        apiError?.message
      ) {
        message =
          apiError.message;
      }
    }


    throw new Error(
      message
    );
  }


  const data =
    await response.json();


  if (
    typeof data?.output_text ===
      "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }


  /*
   * Fallback parser.
   */
  const output =
    Array.isArray(
      data?.output
    )
      ? data.output
      : [];


  const parts:
    string[] = [];


  for (
    const item of output
  ) {

    if (
      item?.type !==
      "message"
    ) {
      continue;
    }


    const content =
      Array.isArray(
        item?.content
      )
        ? item.content
        : [];


    for (
      const part of content
    ) {

      if (
        part?.type ===
          "output_text" &&
        typeof part?.text ===
          "string"
      ) {
        parts.push(
          part.text
        );
      }
    }
  }


  const result =
    parts
      .join("\n")
      .trim();


  if (!result) {
    throw new Error(
      "OpenAI returned no text"
    );
  }


  return result;
}


/* =====================================================
   MARKET AGENT
   ===================================================== */

app.post(
  "/api/market/analyze",
  async (
    req: Request,
    res: Response
  ) => {

    try {

      const symbol =
        String(
          req.body?.symbol ||
            ""
        ).toUpperCase();


      const question =
        String(
          req.body?.question ||
            ""
        ).trim();


      const clientHistory =
        Array.isArray(
          req.body?.history
        )
          ? req.body.history
          : [];


      if (!question) {
        return res
          .status(400)
          .json({
            error:
              "question is required",
          });
      }


      /*
       * IMPORTANT:
       * The selected market is context only.
       * It does NOT force the Agent to talk
       * about that market.
       */
      const selectedSymbol =
        symbol &&
        /^[A-Z0-9]+USDT$/.test(
          symbol
        )
          ? symbol
          : null;


      const snapshot =
        selectedSymbol
          ? getSnapshot(
              selectedSymbol
            )
          : null;


      /* ---------------------------------------------
         MARKET CONTEXT
         --------------------------------------------- */

      let marketContext =
        "No market context is available.";

      if (
        selectedSymbol &&
        snapshot
      ) {

        const pair =
          selectedSymbol.replace(
            /USDT$/,
            "/USD"
          );


        marketContext =
          [
            `Selected market: ${pair}`,
            `Verified source: Binance MCP`,
            `Price: ${snapshot.price}`,
            `24h change: ${snapshot.change_24h}`,
            `24h volume: ${snapshot.volume_24h}`,
          ].join(
            "\n"
          );

      } else if (
        selectedSymbol
      ) {

        const pair =
          selectedSymbol.replace(
            /USDT$/,
            "/USD"
          );


        marketContext =
          [
            `Selected market: ${pair}`,
            "Verified MCP market snapshot: unavailable.",
            "Do not invent current market values.",
          ].join(
            "\n"
          );
      }


      /* ---------------------------------------------
         NORMALIZE CHAT HISTORY
         --------------------------------------------- */

      const history: Array<{
        role:
          "user" |
          "assistant";

        content:
          string;
      }> = [];


      for (
        const item of clientHistory
      ) {

        if (
          !item ||
          (
            item.role !==
              "user" &&
            item.role !==
              "assistant"
          ) ||
          typeof item.content !==
            "string"
        ) {
          continue;
        }


        const content =
          item.content.trim();


        if (!content) {
          continue;
        }


        const previous =
          history[
            history.length - 1
          ];


        /*
         * Responses API expects a sane
         * conversational sequence.
         */
        if (
          previous &&
          previous.role ===
            item.role
        ) {

          previous.content +=
            `\n${content}`;

        } else {

          history.push({
            role:
              item.role,

            content,
          });
        }
      }


      /*
       * Keep recent context only.
       */
      const recentHistory =
        history.slice(
          -12
        );


      /* ---------------------------------------------
         BUILD CURRENT USER MESSAGE
         --------------------------------------------- */

      const messages:
        Array<{
          role:
            "user" |
            "assistant";

          content:
            string;
        }> =
        recentHistory.slice();


      const lastMessage =
        messages[
          messages.length - 1
        ];


      /*
       * The frontend may already send the
       * current user message in history.
       * Avoid duplicating it.
       */
      if (
        !lastMessage ||
        lastMessage.role !==
          "user" ||
        lastMessage.content !==
          question
      ) {

        messages.push({
          role:
            "user",

          content:
            question,
        });
      }


      /* ---------------------------------------------
         SYSTEM / DEVELOPER INSTRUCTIONS
         --------------------------------------------- */

      const systemPrompt = `
You are MarketLens Agent.

Your primary purpose is natural conversation.

You should feel like a thoughtful assistant that the user can chat with,
not like a rigid market-report bot.

GENERAL CONVERSATION
- Answer what the user actually says.
- If the user says "halo", "hai", "hello", "hi", "good morning",
  "good night", "thanks", or talks casually, respond naturally.
- Do not force crypto, trading, BTC, or any market into casual conversation.
- Do not mention BTC just because it is a default asset.
- Do not repeat market statistics when they are not relevant.
- Understand follow-up questions using the recent conversation.
- Ask a short clarifying question when the user's intent is unclear.
- Keep the conversation natural and human.

MARKET CONVERSATION
- Use market context when the user asks about crypto, an asset,
  prices, volume, market movement, or related topics.
- The selected market is context only. It is NOT an instruction to
  talk about that market in every response.
- If the user explicitly mentions another asset, follow the user's topic.
- Use verified MCP data when available.
- Never invent prices, percentages, volume, candles, news, catalysts,
  events, or other current market facts.
- Price movement alone does not prove why an asset moved.
- Never invent a reason for a move.
- Never claim a future price as fact.
- Never give a guaranteed prediction.

STYLE
- Answer the user's actual question first.
- Be conversational.
- Avoid repetitive templates.
- Avoid sounding like a system or an automated report.
- Do not dump raw JSON unless the user asks.
- Do not start every answer with market statistics.
- Match the user's language.
- For casual Indonesian conversation, use natural Indonesian.
- For English, answer naturally in English.
- Use readable pairs such as BTC/USD rather than BTCUSDT in normal prose.

VERIFIED MARKET CONTEXT
${marketContext}
`.trim();


      /* ---------------------------------------------
         CALL OPENAI
         --------------------------------------------- */

      const answer =
        await callOpenAI(
          messages,
          systemPrompt
        );


      return res.json({
        answer,

        symbol:
          selectedSymbol,

        pair:
          selectedSymbol
            ? selectedSymbol.replace(
                /USDT$/,
                "/USD"
              )
            : null,

        market:
          snapshot
            ? {
                symbol:
                  snapshot.symbol,

                price:
                  snapshot.price,

                change_24h:
                  snapshot.change_24h,

                volume_24h:
                  snapshot.volume_24h,

                source:
                  "mcp",
              }
            : null,

        source:
          "openai",
      });

    } catch (error) {

      console.error(
        "Market Agent error:",
        error
      );


      return res
        .status(502)
        .json({
          error:
            error instanceof Error
              ? error.message
              : "OpenAI Agent request failed",
        });
    }
  }
);


/* =====================================================
   NEWS ANALYSIS
   ===================================================== */

app.post(
  "/api/analyze",
  (
    req: Request,
    res: Response
  ) => {

    const news =
      req.body?.news;


    if (
      !news ||
      typeof news !==
        "string" ||
      news.trim().length ===
        0
    ) {
      return res
        .status(400)
        .json({
          error:
            "Field 'news' is required and must be a non-empty string.",
        });
    }


    const text =
      news.trim();


    const knownTickers:
      string[] = [
        "BTC",
        "ETH",
        "BNB",
        "SOL",
        "ADA",
        "XRP",
        "DOGE",
        "LTC",
        "LINK",
        "TRX",
      ];


    const upperText =
      text.toUpperCase();


    const found =
      knownTickers.filter(
        (
          ticker
        ) => {

          const pattern =
            new RegExp(
              `\\b${ticker}\\b`,
              "i"
            );

          return pattern.test(
            upperText
          );
        }
      );


    const assets =
      found.length
        ? found.slice(
            0,
            3
          )
        : [
            "BTC"
          ];


    const primarySymbol =
      `${assets[0]}USDT`;


    const cachedSnapshotRaw =
      getSnapshot(
        primarySymbol
      );


    const snapshot:
      Snapshot =
      cachedSnapshotRaw
        ? {
            symbol:
              cachedSnapshotRaw.symbol,

            price:
              cachedSnapshotRaw.price,

            change_24h:
              cachedSnapshotRaw.change_24h,

            volume_24h:
              cachedSnapshotRaw.volume_24h,
          }
        : null;


    const snapshotSource =
      cachedSnapshotRaw
        ? "mcp"
        : "unavailable";


    const analysis =
      analyzeNews(
        text,
        assets,
        snapshot
      );


    const market_snapshot =
      snapshot
        ? {
            symbol:
              snapshot.symbol,

            price:
              snapshot.price,

            change_24h:
              snapshot.change_24h,

            volume_24h:
              snapshot.volume_24h,
          }
        : {
            symbol:
              primarySymbol,

            price:
              null,

            change_24h:
              null,

            volume_24h:
              null,
          };


    return res.json({

      assets:
        analysis.assets,

      sentiment:
        analysis.sentiment,

      impact:
        analysis.impact,

      confidence:
        analysis.confidence,

      market_snapshot,

      market_snapshot_source:
        snapshotSource,

      reasoning:
        analysis.reasoning,

      key_risk:
        analysis.key_risk,

      prediction:
        analysis.prediction,

      sentiment_score:
        analysis.sentiment_score,

      confidence_components:
        analysis.confidence_components,

      evidence:
        analysis.evidence,

      short_actionable_summary:
        analysis.short_actionable_summary,

      impact_rationale:
        analysis.impact_rationale,
    });
  }
);


/* =====================================================
   API 404 FALLBACK
   ===================================================== */

app.use(
  (
    req: Request,
    res: Response,
    _next
  ) => {

    if (
      req.path.startsWith(
        "/api/"
      )
    ) {

      return res
        .status(404)
        .json({
          error:
            "API route not found",
        });
    }


    res.sendFile(
      path.join(
        publicPath,
        "index.html"
      )
    );
  }
);


/* =====================================================
   START SERVER
   ===================================================== */

app.listen(
  PORT,
  () => {

    console.log(
      `AI News Impact Analyzer running at http://localhost:${PORT}`
    );
  }
);