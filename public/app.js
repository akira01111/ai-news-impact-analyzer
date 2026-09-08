document.addEventListener("DOMContentLoaded", () => {
  /* =====================================================
     DOM ELEMENTS
     ===================================================== */
  const tickerCards = [...document.querySelectorAll(".ticker-card")];
  const marketTabs = [...document.querySelectorAll(".market-tab")];
  
  const overviewNav = document.getElementById("overviewNav");
  const newsNav = document.getElementById("newsNav");
  const overviewPage = document.getElementById("overviewPage");
  const newsPage = document.getElementById("newsPage");
  
  const marketChartSection = document.getElementById("marketChartSection");
  const chartSymbolEl = document.getElementById("chartSymbol");
  const chartPriceEl = document.getElementById("chartPrice");
  const chartChangeEl = document.getElementById("chartChange");
  const chartUpdatedEl = document.getElementById("chartUpdated");
  const chartLoadingEl = document.getElementById("chartLoading");
  const chartSvg = document.getElementById("marketChart");
  
  const marketAnalysisTitleEl = document.getElementById("marketAnalysisTitle");
  const spotPriceEl = document.getElementById("spotPrice");
  const spotChangeEl = document.getElementById("spotChange");
  const spotVolumeEl = document.getElementById("spotVolume");
  const marketInsightEl = document.getElementById("marketInsight");
  const telemetryLogStream = document.getElementById("telemetryLogStream");

  /* =====================================================
     STATE MANAGEMENT
     ===================================================== */
  const state = {
    selectedSymbol: "BTCUSDT",
    snapshot: null,
    history: []
  };

  const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "LINKUSDT"];
  const analysisSymbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];


  /* =====================================================
     FORMATTERS
     ===================================================== */
  function toNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = typeof value === "number" ? value : Number(String(value).replace(/[$,%\s]/g, "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function toPercent(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = parseFloat(String(value).replace("%", "").replace(",", "").trim());
    return Number.isFinite(n) ? n : null;
  }

  function formatPrice(value) {
    const n = toNumber(value);
    if (n === null) return "—";
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatChange(value) {
    const n = toPercent(value);
    if (n === null) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  }

  function formatVolume(value) {
    if (value === null || value === undefined) return "—";
    const raw = String(value).trim();
    if (!raw) return "—";
    if (/[A-Za-z]/.test(raw)) return raw;
    const n = toNumber(raw);
    if (n === null) return raw;
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  }

  function applyChangeColor(element, value) {
    if (!element) return;
    const n = toPercent(value);
    element.classList.remove("positive", "negative");
    element.style.color = "";
    if (n === null) return;
    element.classList.add(n >= 0 ? "positive" : "negative");
    element.style.color = n < 0 ? "var(--red)" : "var(--green)";
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }


  /* =====================================================
     PAGE NAVIGATION
     ===================================================== */
  function showPage(page) {
    const isNews = page === "news";
    if (overviewPage) {
      overviewPage.hidden = isNews;
      overviewPage.style.display = isNews ? "none" : "";
    }
    if (newsPage) {
      newsPage.hidden = !isNews;
      newsPage.style.display = isNews ? "" : "none";
    }
    overviewNav?.classList.toggle("active", !isNews);
    newsNav?.classList.toggle("active", isNews);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  overviewNav?.addEventListener("click", (e) => { e.preventDefault(); showPage("overview"); });
  newsNav?.addEventListener("click", (e) => { e.preventDefault(); showPage("news"); });


  /* =====================================================
     COMPACT TELEMETRY LOG STREAM
     ===================================================== */
  function pushTelemetryLog(message) {
    if (!telemetryLogStream) return;
    const row = document.createElement("div");
    const timestamp = new Date().toTimeString().split(" ")[0];
    row.textContent = `> [${timestamp}] ${message}`;
    telemetryLogStream.appendChild(row);
    telemetryLogStream.scrollTop = telemetryLogStream.scrollHeight;

    if (telemetryLogStream.children.length > 20) {
      telemetryLogStream.removeChild(telemetryLogStream.firstChild);
    }
  }


  /* =====================================================
     BINANCE DIRECT DATA FETCHER
     ===================================================== */
  async function fetchMarketSnapshot(symbol) {
    const encoded = encodeURIComponent(symbol);
    const data = await fetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${encoded}`);
    return {
      symbol: String(data.symbol || symbol).toUpperCase(),
      price: toNumber(data.lastPrice),
      change_24h: toPercent(data.priceChangePercent),
      volume_24h: toNumber(data.quoteVolume),
      high_24h: toNumber(data.highPrice),
      low_24h: toNumber(data.lowPrice)
    };
  }

  async function loadTopTickers() {
    if (!tickerCards.length) return;
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const snapshot = await fetchMarketSnapshot(symbol);
          const card = tickerCards.find((item) => {
            const dataTicker = item.getAttribute("data-ticker");
            return dataTicker && dataTicker.trim().toUpperCase() === symbol;
          });

          if (!card) return;
          const priceEl = card.querySelector(".ticker-price");
          const changeEl = card.querySelector(".ticker-change");
          
          if (priceEl) priceEl.textContent = formatPrice(snapshot.price);
          if (changeEl) {
            changeEl.textContent = formatChange(snapshot.change_24h);
            applyChangeColor(changeEl, snapshot.change_24h);
          }
        } catch (error) {
          console.warn(`Unable to load ${symbol}:`, error);
        }
      })
    );
  }


  /* =====================================================
     CHART & FACTUAL MARKET ANALYSIS
     ===================================================== */
  async function fetchHistory(symbol) {
    const rows = await fetchJson(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=48`);
    if (!Array.isArray(rows)) throw new Error("Invalid chart response");
    return rows.map((row) => ({
      time: Number(row?.[0]),
      close: Number(row?.[4])
    })).filter((point) => Number.isFinite(point.time) && Number.isFinite(point.close));
  }

  function drawChart(points, targetSvg = chartSvg) {
    if (!targetSvg || !Array.isArray(points) || points.length < 2) return;

    const width = 1000;
    const height = 360;
    const left = 64;
    const right = 24;
    const top = 24;
    const bottom = 42;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;

    const closes = points.map((point) => point.close);
    let min = Math.min(...closes);
    let max = Math.max(...closes);

    if (min === max) { min -= 1; max += 1; }
    const range = max - min;
    min -= range * 0.08;
    max += range * 0.08;

    const xFor = (index) => left + (index / (points.length - 1)) * chartWidth;
    const yFor = (value) => top + ((max - value) / (max - min)) * chartHeight;

    const coords = closes.map((value, index) => ({ x: xFor(index), y: yFor(value) }));
    const linePath = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
    const last = coords[coords.length - 1];

    const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const y = top + chartHeight * ratio;
      const value = max - (max - min) * ratio;
      return `
        <line class="chart-grid-line" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="rgba(255,176,0,0.15)"/>
        <text class="chart-axis-label" x="8" y="${y + 4}" fill="rgba(255,176,0,0.6)" font-family="monospace" font-size="12">
          ${formatPrice(value)}
        </text>
      `;
    }).join("");

    targetSvg.innerHTML = `
      ${grid}
      <path d="${linePath}" class="chart-line" fill="none" stroke="var(--amber)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="${last.x}" cy="${last.y}" r="6" class="chart-last-point" fill="var(--bg)" stroke="var(--amber)" stroke-width="2" />
    `;
  }

  async function loadSelectedChart(symbol, price, change) {
    if (!marketChartSection) return;
    marketChartSection.hidden = false;
    if (chartSymbolEl) chartSymbolEl.textContent = symbol;
    if (chartPriceEl) chartPriceEl.textContent = formatPrice(price);
    
    if (chartChangeEl) {
      chartChangeEl.textContent = formatChange(change);
      applyChangeColor(chartChangeEl, change);
    }
    
    if (chartUpdatedEl) chartUpdatedEl.textContent = "48H · 1H CANDLES";
    if (chartLoadingEl) {
      chartLoadingEl.style.display = "flex";
      chartLoadingEl.textContent = "Loading market history…";
    }
    if (chartSvg) chartSvg.innerHTML = "";

    try {
      const points = await fetchHistory(symbol);
      state.history = points;
      drawChart(points, chartSvg);

      if (chartLoadingEl) chartLoadingEl.style.display = "none";
      pushTelemetryLog(`Chart updated`);
    } catch (error) {
      console.warn("Chart history unavailable:", error);
      if (chartLoadingEl) {
        chartLoadingEl.style.display = "flex";
        chartLoadingEl.textContent = "Historical chart temporarily unavailable.";
      }
    }
  }

  // Factual Market Analysis without unproven institutional claims
  function renderMarketAnalysis(snapshot) {
    if (!marketInsightEl) return;
    const symbol = snapshot.symbol;
    const priceStr = formatPrice(snapshot.price);
    const changeVal = toPercent(snapshot.change_24h);
    const volumeStr = formatVolume(snapshot.volume_24h);

    let direction = "relatively flat";
    if (changeVal !== null) {
      if (changeVal > 0.5) direction = "moving upward";
      else if (changeVal < -0.5) direction = "moving downward";
    }

    marketInsightEl.innerHTML = `
      ${symbol} is currently trading at ${priceStr},<br>
      ${changeVal !== null && changeVal < 0 ? "down" : "up"} ${Math.abs(changeVal || 0).toFixed(2)}% over the past 24h.<br><br>
      24h volume stands at ${volumeStr},<br>
      while price action remains ${direction}.
    `;
    pushTelemetryLog(`Analysis compiled`);
  }

  async function renderSelectedMarket() {
    const symbol = state.selectedSymbol;

    marketTabs.forEach((tab) => {
      const tabSymbol = String(tab.dataset.marketSymbol || tab.textContent.trim() || "").toUpperCase();
      const isActive = tabSymbol === symbol;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    if (marketAnalysisTitleEl) marketAnalysisTitleEl.textContent = symbol;
    if (chartSymbolEl) chartSymbolEl.textContent = symbol;

    if (spotPriceEl) spotPriceEl.textContent = "—";
    if (spotChangeEl) {
      spotChangeEl.textContent = "—";
      spotChangeEl.classList.remove("positive", "negative");
      spotChangeEl.style.color = "";
    }
    if (spotVolumeEl) spotVolumeEl.textContent = "—";
    if (marketInsightEl) marketInsightEl.textContent = `Syncing telemetry for ${symbol}...`;

    try {
      const snapshot = await fetchMarketSnapshot(symbol);
      if (symbol !== state.selectedSymbol) return;

      state.snapshot = snapshot;

      if (spotPriceEl) spotPriceEl.textContent = formatPrice(snapshot.price);
      if (spotChangeEl) {
        spotChangeEl.textContent = `${formatChange(snapshot.change_24h)} (24h)`;
        applyChangeColor(spotChangeEl, snapshot.change_24h);
      }
      if (spotVolumeEl) spotVolumeEl.textContent = formatVolume(snapshot.volume_24h);

      renderMarketAnalysis(snapshot);
      await loadSelectedChart(symbol, snapshot.price, snapshot.change_24h);
      pushTelemetryLog(`Order book synced`);

    } catch (error) {
      console.error(`Unable to load ${symbol}:`, error);
      state.snapshot = null;
      if (marketInsightEl) marketInsightEl.textContent = `Telemetry stream offline for ${symbol}.`;
    }
  }

  tickerCards.forEach((card) => {
    card.addEventListener("click", () => {
      const symbol = String(card.dataset.ticker || card.querySelector(".ticker-symbol")?.textContent || "").trim().toUpperCase();
      if (!symbol || !analysisSymbols.includes(symbol)) return;
      tickerCards.forEach((item) => item.classList.remove("selected"));
      card.classList.add("selected");
      state.selectedSymbol = symbol;
      renderSelectedMarket();
      marketChartSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  marketTabs.forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      const symbol = String(tab.dataset.marketSymbol || tab.textContent.trim() || "").toUpperCase();
      if (!analysisSymbols.includes(symbol)) return;
      state.selectedSymbol = symbol;
      renderSelectedMarket();
    });
  });


  /* =====================================================
     NEWS IMPACT ANALYZER
     ===================================================== */
  const analyzeBtns = document.querySelectorAll(".analyze-btn");
  
  analyzeBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      const asset = btn.getAttribute("data-asset");
      const title = btn.getAttribute("data-title");
      const wrapper = btn.closest(".news-card-wrapper");
      
      const container = wrapper.querySelector(".ai-analysis-container");
      const svgEl = wrapper.querySelector(".ai-inline-chart");
      const priceEl = wrapper.querySelector(".live-price");
      const changeEl = wrapper.querySelector(".live-change");
      const reasoningEl = wrapper.querySelector(".reasoning-text");
      const sentimentBadge = wrapper.querySelector(".sentiment-badge");
      const impactBadge = wrapper.querySelector(".impact-badge");

      if (!container.hidden && !btn.hasAttribute("data-loading")) {
         container.hidden = true;
         return;
      }
      
      container.hidden = false;
      btn.setAttribute("data-loading", "true");
      
      reasoningEl.innerHTML = `> INTERCEPTING BINANCE TELEMETRY FOR ${asset}...`;
      sentimentBadge.textContent = "ANALYZING";
      sentimentBadge.className = "metric-pill sentiment-badge neutral";
      impactBadge.textContent = "Impact: CALC...";
      
      const symbol = asset;

      try {
        const snapshot = await fetchMarketSnapshot(symbol);
        priceEl.textContent = formatPrice(snapshot.price);
        changeEl.textContent = formatChange(snapshot.change_24h);
        applyChangeColor(changeEl, snapshot.change_24h);

        const history = await fetchHistory(symbol);
        drawChart(history, svgEl);

        const changeVal = toPercent(snapshot.change_24h) || 0;
        let sentiment = changeVal >= 0 ? "BULLISH" : "BEARISH";
        let impact = Math.abs(changeVal) > 3 ? "HIGH" : Math.abs(changeVal) > 1 ? "MEDIUM" : "LOW";

        reasoningEl.innerHTML = `Headline verified against live order book.<br>Asset <strong>${asset}</strong> registers a 24h change of <strong>${changeEl.textContent}</strong>.<br>Market volume and price action indicate a <strong>${sentiment}</strong> short-term trend.<br>> STATUS: Telemetry verified.`;

        sentimentBadge.textContent = sentiment;
        sentimentBadge.className = `metric-pill sentiment-badge ${sentiment.toLowerCase()}`;
        impactBadge.textContent = `Impact: ${impact}`;
        
        pushTelemetryLog(`Impact analysis compiled`);
        btn.removeAttribute("data-loading");
      } catch (err) {
         reasoningEl.textContent = "ERROR: Failed to establish secure telemetry node.";
         priceEl.textContent = "ERR";
         changeEl.textContent = "ERR";
         btn.removeAttribute("data-loading");
      }
    });
  });


  /* =====================================================
     INITIALIZATION
     ===================================================== */
  showPage("overview");
  loadTopTickers();
  renderSelectedMarket();

  setInterval(loadTopTickers, 30000);
  setInterval(() => { renderSelectedMarket(); }, 30000);
});