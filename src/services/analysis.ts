// src/services/analysis.ts
// Deterministic crypto-news analysis helper for MarketLens.
// No external dependencies.

export type Snapshot = {
  symbol: string;
  price: string | number;
  change_24h: string | number;
  volume_24h: string | number;
} | null;

export type AnalysisResult = {
  assets: string[];
  sentiment: string;
  sentiment_score: number;
  impact: string;
  impact_rationale: string;
  confidence: number;
  confidence_components: Record<string, number>;
  evidence: {
    matchedKeywords: {
      positive: string[];
      negative: string[];
      impact: string[];
      intensifiers: string[];
    };
    mentionCount: number;
    numericMentions: {
      prices: string[];
      percents: string[];
    };
    snapshot?: Snapshot;
  };
  prediction: {
    direction: string;
    expected_pct_range: string;
    timeframe: string;
  };
  reasoning: string;
  short_actionable_summary: string;
  key_risk: string;
};

function clamp(v: number, a = 0, b = 1): number {
  return Math.max(a, Math.min(b, v));
}

function parsePercent(input: unknown): number | null {
  if (input == null) return null;
  const m = String(input).trim().match(/([+-]?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function escapeForRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findAllMatches(text: string, keywords: string[]): string[] {
  const found: string[] = [];
  for (const kw of keywords) {
    const re = new RegExp(`\\b${escapeForRegExp(kw)}\\b`, "ig");
    if (re.test(text)) found.push(kw);
  }
  return found;
}

function findAllMatchesCount(
  text: string,
  keywords: string[]
): { total: number; matched: string[] } {
  let total = 0;
  const matched: string[] = [];

  for (const kw of keywords) {
    const re = new RegExp(`\\b${escapeForRegExp(kw)}\\b`, "ig");
    const matches = text.match(re);
    if (matches?.length) {
      total += matches.length;
      matched.push(kw);
    }
  }

  return { total, matched };
}

function extractNumericMentions(text: string): {
  prices: string[];
  percents: string[];
} {
  const prices = text.match(/\$\s?[\d,]+(?:\.\d+)?/g) ?? [];
  const percents = text.match(/[+-]?\d+(?:\.\d+)?\s?%/g) ?? [];
  return { prices, percents };
}

type PhraseSignal = {
  phrase: string;
  weight: number;
  negated: boolean;
};

const PHRASE_LEXICON: Array<[string, number]> = [
  ["institutional adoption", 1.9],
  ["institutional demand", 1.8],
  ["institutional inflows", 1.8],
  ["institutional investors", 1.2],
  ["mainstream adoption", 1.7],
  ["spot etf approval", 2.4],
  ["etf approval", 2.2],
  ["etf inflows", 1.9],
  ["etf inflow", 1.9],
  ["record inflows", 1.8],
  ["regulatory approval", 2.1],
  ["regulatory clarity", 1.6],
  ["regulatory green light", 2.0],
  ["exchange listing", 1.9],
  ["network growth", 1.4],
  ["ecosystem growth", 1.4],
  ["user growth", 1.3],
  ["major partnership", 1.9],
  ["strategic partnership", 1.7],
  ["mainnet launch", 1.4],
  ["staking inflows", 1.3],
  ["all-time high", 1.6],
  ["record high", 1.6],
  ["rate cut", 1.5],
  ["lower interest rates", 1.5],
  ["interest rate cut", 1.5],

  ["security breach", -2.1],
  ["private key leak", -2.2],
  ["bridge exploit", -2.3],
  ["smart contract exploit", -2.2],
  ["rug pull", -2.3],
  ["regulatory crackdown", -2.1],
  ["enforcement action", -1.9],
  ["class action lawsuit", -1.9],
  ["trading ban", -2.1],
  ["outright ban", -2.1],
  ["fraud charges", -2.2],
  ["insolvency", -2.3],
  ["bankruptcy", -2.3],
  ["rate hike", -1.5],
  ["higher interest rates", -1.5],
  ["interest rate hike", -1.5],
  ["market sell-off", -1.9],
  ["market selloff", -1.9],
  ["forced liquidations", -1.9],
  ["mass liquidations", -1.9],
  ["record outflows", -1.8],
  ["death spiral", -2.0],
  ["depegged", -2.0],
  ["depeg", -1.9],
];

const NEGATION_WORDS = [
  "not",
  "no",
  "never",
  "without",
  "denies",
  "denied",
  "rejects",
  "rejected",
  "fails",
  "failed",
];

function detectPhraseSignals(
  text: string
): {
  signals: PhraseSignal[];
  score: number;
  positive: string[];
  negative: string[];
} {
  const signals: PhraseSignal[] = [];
  const positive: string[] = [];
  const negative: string[] = [];
  let score = 0;

  for (const [phrase, weight] of [...PHRASE_LEXICON].sort(
    (a, b) => b[0].length - a[0].length
  )) {
    const pattern = escapeForRegExp(phrase).replace(/[-\s]+/g, "[\\s-]+");
    const re = new RegExp(`\\b${pattern}\\b`, "ig");
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      const context = text.slice(Math.max(0, match.index - 40), match.index);
      const isNegated = NEGATION_WORDS.some((word) =>
        new RegExp(`\\b${escapeForRegExp(word)}\\b`, "i").test(context)
      );

      const effectiveWeight = isNegated ? -weight * 0.8 : weight;

      signals.push({
        phrase,
        weight: Number(effectiveWeight.toFixed(2)),
        negated: isNegated,
      });

      score += effectiveWeight;

      const target = effectiveWeight > 0 ? positive : negative;
      if (!target.includes(phrase)) target.push(phrase);
    }
  }

  return { signals, score, positive, negative };
}

const ASSET_ALIASES: Record<string, string[]> = {
  BTC: ["bitcoin", "btc"],
  ETH: ["ethereum", "ether", "eth"],
  BNB: ["bnb", "binance coin"],
  SOL: ["solana", "sol"],
  ADA: ["cardano", "ada"],
  XRP: ["xrp", "ripple"],
  DOGE: ["dogecoin", "doge"],
  LTC: ["litecoin", "ltc"],
  LINK: ["chainlink", "link"],
  TRX: ["tron", "trx"],
};

export function analyzeNews(
  text: string,
  assets: string[],
  snapshot: Snapshot
): AnalysisResult {
  const lc = text.toLowerCase();

  const positive = [
    "surge", "rise", "bull", "gain", "upgrade", "increase", "soar",
    "rally", "record", "outperform", "beat", "growth", "adoption",
    "approved", "approval", "inflows", "partnership", "listing",
  ];

  const negative = [
    "drop", "fall", "sell", "bear", "hack", "downgrade", "plunge",
    "slump", "attack", "loss", "suspend", "delist", "exploit",
    "breach", "lawsuit", "crackdown", "ban", "outflows",
    "liquidation", "sell-off", "selloff", "rate hike",
  ];

  const intensifiers = [
    "massive", "huge", "sudden", "blowout", "dramatic", "sharp",
    "significant", "major",
  ];

  const impactHigh = [
    "listing", "partnership", "acquisition", "major", "regulation",
    "ban", "approval", "exploit", "hack", "lawsuit", "crackdown",
    "etf", "institutional",
  ];

  const impactMedium = [
    "update", "announcement", "integration", "proposal", "upgrade",
    "release", "adoption", "growth", "inflows", "outflows",
  ];

  const pos = findAllMatchesCount(text, positive);
  const neg = findAllMatchesCount(text, negative);
  const ints = findAllMatchesCount(text, intensifiers);

  const impactMatchedHigh = findAllMatches(text, impactHigh);
  const impactMatchedMedium = findAllMatches(text, impactMedium);

  const phrase = detectPhraseSignals(lc);
  const numeric = extractNumericMentions(text);

  let mentionCount = 0;
  for (const asset of assets) {
    const aliases = ASSET_ALIASES[asset.toUpperCase()] ?? [asset];
    for (const alias of aliases) {
      const re = new RegExp(`\\b${escapeForRegExp(alias)}\\b`, "ig");
      mentionCount += text.match(re)?.length ?? 0;
    }
  }

  // Word signals are intentionally weaker than contextual phrases.
  // This prevents generic words such as "major" from becoming bullish by themselves.
  const wordScore = pos.total - neg.total;

  // Intensifiers amplify an existing directional signal; they do not create one.
  const intensifierEffect =
    Math.sign(wordScore + phrase.score) * Math.min(1.5, ints.total * 0.35);

  const sentimentBase = wordScore + phrase.score + intensifierEffect;

  const sentiment_score = clamp(
    Number(sentimentBase.toFixed(3)),
    -10,
    10
  );

  let sentiment = "neutral";
  if (sentiment_score >= 1.6) {
    sentiment = "strong_bullish";
  } else if (sentiment_score >= 0.6) {
    sentiment = "bullish";
  } else if (sentiment_score >= 0.2) {
    sentiment = "slightly_bullish";
  } else if (sentiment_score <= -1.6) {
    sentiment = "strong_bearish";
  } else if (sentiment_score <= -0.6) {
    sentiment = "bearish";
  } else if (sentiment_score <= -0.2) {
    sentiment = "slightly_bearish";
  }

  let snapshotSignalScore = 0;
  let snapshotParsedChange: number | null = null;
  let snapshotVolumeNum: number | null = null;

  if (snapshot) {
    const parsed = parsePercent(snapshot.change_24h);
    if (parsed != null) {
      snapshotParsedChange = parsed;
      snapshotSignalScore = clamp(parsed / 10, -1, 1);
    }

    const vol = Number(String(snapshot.volume_24h).replace(/[^0-9.-]/g, ""));
    if (!Number.isNaN(vol)) snapshotVolumeNum = vol;
  }

  let impactScore = 0;
  if (impactMatchedHigh.length) impactScore += 2 * impactMatchedHigh.length;
  if (impactMatchedMedium.length) impactScore += impactMatchedMedium.length;
  impactScore += Math.abs(sentiment_score) * 0.6;
  impactScore += Math.min(2, mentionCount * 0.5);

  let impact = "low";
  if (impactScore >= 3.5) impact = "high";
  else if (impactScore >= 1.5) impact = "medium";

  const impactRationaleParts: string[] = [];
  if (impactMatchedHigh.length) {
    impactRationaleParts.push(
      `high-impact words: ${impactMatchedHigh.join(", ")}`
    );
  }
  if (impactMatchedMedium.length) {
    impactRationaleParts.push(
      `medium-impact words: ${impactMatchedMedium.join(", ")}`
    );
  }
  if (phrase.signals.length) {
    impactRationaleParts.push(
      `contextual signals: ${phrase.signals.map((s) => s.phrase).join(", ")}`
    );
  }
  if (mentionCount > 0) {
    impactRationaleParts.push(
      `${mentionCount} mention(s) of ${assets.join(", ")}`
    );
  }
  if (snapshot && snapshotParsedChange != null) {
    impactRationaleParts.push(`current 24h change ${snapshotParsedChange}%`);
  }

  const impact_rationale =
    impactRationaleParts.join("; ") || "No strong impact signals found.";

  const kwStrength = clamp(Math.abs(sentiment_score) / 3);
  const phraseStrength = clamp(Math.abs(phrase.score) / 3);

  let snapshotEvidence = 0;
  if (snapshot && snapshotParsedChange != null) {
    const sentimentSign =
      sentiment_score > 0 ? 1 : sentiment_score < 0 ? -1 : 0;
    const snapshotSign =
      snapshotParsedChange > 0 ? 1 : snapshotParsedChange < 0 ? -1 : 0;
    const match =
      sentimentSign !== 0 && sentimentSign === snapshotSign ? 1 : 0;
    const mag = clamp(Math.abs(snapshotParsedChange) / 5);
    snapshotEvidence = match * (0.4 * mag + 0.1);
  }

  const mentionBoost = clamp(Math.min(0.15, mentionCount * 0.04));
  const numericEvidence =
    numeric.prices.length || numeric.percents.length ? 0.06 : 0;
  const recencyBoost =
    /\b(now|today|currently|just|recent|immediately)\b/i.test(text)
      ? 0.03
      : 0;

  const baseFloor = 0.25;
  const confidenceRaw = clamp(
    baseFloor +
      kwStrength * 0.45 +
      phraseStrength * 0.20 +
      snapshotEvidence +
      mentionBoost +
      numericEvidence +
      recencyBoost,
    0.25,
    0.98
  );

  const confidence = Number(confidenceRaw.toFixed(2));

  const confidence_components: Record<string, number> = {
    base: Number(baseFloor.toFixed(3)),
    keyword_strength: Number(kwStrength.toFixed(3)),
    phrase_strength: Number(phraseStrength.toFixed(3)),
    snapshot_evidence: Number(snapshotEvidence.toFixed(3)),
    mention_boost: Number(mentionBoost.toFixed(3)),
    numeric_evidence: Number(numericEvidence.toFixed(3)),
    recency_boost: Number(recencyBoost.toFixed(3)),
  };

  const timeframe = "24h";
  let expectedLow = 1;
  let expectedHigh = 3;

  if (snapshot && snapshotParsedChange != null) {
    const volProxy = clamp(Math.abs(snapshotParsedChange), 0.5, 12);
    expectedLow = Number(Math.max(0.5, volProxy * 0.4).toFixed(2));
    expectedHigh = Number(
      Math.max(expectedLow + 0.5, volProxy * 1.2 + 0.5).toFixed(2)
    );

    if (Math.abs(sentiment_score) > 1.2) {
      expectedHigh *= 1.2;
    } else {
      expectedLow *= 0.9;
      expectedHigh *= 0.9;
    }

    if (snapshotVolumeNum != null && snapshotVolumeNum > 500000) {
      expectedLow *= 1.1;
      expectedHigh *= 1.15;
    }
  } else {
    if (impact === "low") {
      expectedLow = 1;
      expectedHigh = 3;
    } else if (impact === "medium") {
      expectedLow = 2;
      expectedHigh = 6;
    } else {
      expectedLow = 5;
      expectedHigh = 15;
    }
  }

  let direction = "neutral";
  if (Math.abs(sentiment_score) >= 1.2) {
    direction = sentiment_score > 0 ? "up" : "down";
  } else if (snapshotParsedChange != null) {
    const textSign =
      sentiment_score > 0 ? 1 : sentiment_score < 0 ? -1 : 0;
    const marketSign =
      snapshotParsedChange > 0 ? 1 : snapshotParsedChange < 0 ? -1 : 0;

    if (textSign === 0 && Math.abs(snapshotParsedChange) < 0.5) {
      direction = "neutral";
    } else if (textSign !== 0 && marketSign !== textSign) {
      direction = "uncertain";
    } else {
      direction = textSign > 0 ? "up" : textSign < 0 ? "down" : "neutral";
    }
  } else {
    if (sentiment_score > 0.4) direction = "up";
    else if (sentiment_score < -0.4) direction = "down";
  }

  const expected_pct_range =
    `${Number(expectedLow.toFixed(2))}% to ${Number(expectedHigh.toFixed(2))}%`;

  const evidence = {
    matchedKeywords: {
      positive: [...pos.matched, ...phrase.positive],
      negative: [...neg.matched, ...phrase.negative],
      impact: [
        ...impactMatchedHigh,
        ...impactMatchedMedium,
        ...phrase.signals.map((s) => s.phrase),
      ],
      intensifiers: ints.matched,
    },
    mentionCount,
    numericMentions: numeric,
    snapshot: snapshot ?? undefined,
  };

  const reasoningParts: string[] = [];
  reasoningParts.push(
    `Text evidence: ${pos.total} positive mention(s), ${neg.total} negative mention(s), ${ints.total} intensifier(s), ${phrase.signals.length} contextual phrase signal(s).`
  );

  if (phrase.signals.length) {
    reasoningParts.push(
      `Contextual signals: ${phrase.signals
        .map((s) => `${s.phrase}${s.negated ? " (negated)" : ""}`)
        .join(", ")}.`
    );
  }

  if (numeric.prices.length || numeric.percents.length) {
    reasoningParts.push(
      `Numerical mentions detected: ${[
        ...numeric.prices,
        ...numeric.percents,
      ].join(", ")}.`
    );
  }

  if (snapshot && snapshotParsedChange != null) {
    reasoningParts.push(
      `Market snapshot (${snapshot.symbol}) shows ${snapshotParsedChange}% over 24h with volume ${snapshot.volume_24h}.`
    );

    if (snapshotSignalScore !== 0 && sentiment_score !== 0) {
      const sameDirection =
        Math.sign(snapshotSignalScore) === Math.sign(sentiment_score);
      reasoningParts.push(
        `Snapshot direction ${sameDirection ? "supports" : "contradicts"} the text-based signal.`
      );
    }
  } else {
    reasoningParts.push(
      "No live market snapshot available; using textual evidence and conservative defaults."
    );
  }

  reasoningParts.push(
    `Impact assessment: ${impact}. Rationale: ${impact_rationale}.`
  );
  reasoningParts.push(
    `Confidence: ${confidence} (components: ${Object.entries(
      confidence_components
    )
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")})`
  );

  const reasoning = reasoningParts.join(" ");

  const short_actionable_summary =
    `Signal: ${sentiment.replace("_", " ")} for ${assets[0]} — ${
      direction === "up"
        ? "expect upward pressure"
        : direction === "down"
          ? "expect downward pressure"
          : direction === "uncertain"
            ? "direction is uncertain"
            : "no clear directional bias"
    } (${expected_pct_range}, ${timeframe}). Confidence ${confidence}.`;

  const key_risk =
    "News may be speculative, quotes may be out of context, and market moves can be driven by liquidity or large holders unrelated to this news.";

  return {
    assets,
    sentiment,
    sentiment_score: Number(sentiment_score.toFixed(3)),
    impact,
    impact_rationale,
    confidence,
    confidence_components,
    evidence,
    prediction: {
      direction,
      expected_pct_range,
      timeframe,
    },
    reasoning,
    short_actionable_summary,
    key_risk,
  };
}
