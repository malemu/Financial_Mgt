import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const db = new Database("./data/financial_mgt.db");

const snapshotDir = path.join(process.cwd(), "strategic_snapshot");
if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir);

function stdDev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
    values.length;
  return Math.sqrt(variance);
}

function exportRawPriceHistory() {
  const rawDir = path.join(snapshotDir, "raw");

  if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir);

  console.log("Exporting raw price history...");

  const rows = db.prepare(`
    SELECT *
    FROM price_history
    ORDER BY ticker, date ASC
  `).all();

  fs.writeFileSync(
    path.join(rawDir, "price_history.json"),
    JSON.stringify(rows, null, 2)
  );

  console.log(`Exported raw price history (${rows.length} rows)`);
}


function maxDrawdown(prices) {
  let peak = prices[0];
  let maxDD = 0;

  for (let price of prices) {
    if (price > peak) peak = price;
    const drawdown = (price - peak) / peak;
    if (drawdown < maxDD) maxDD = drawdown;
  }

  return maxDD;
}

function exportMarketSummary() {
  const tickers = db.prepare(`
    SELECT DISTINCT ticker FROM price_history
  `).all();

  const summary = [];

  tickers.forEach(({ ticker }) => {
    const rows = db.prepare(`
      SELECT date, close
      FROM price_history
      WHERE ticker = ?
      ORDER BY date ASC
    `).all(ticker);

    if (rows.length < 50) return;

    const prices = rows.map(r => r.close);
    const latestPrice = prices[prices.length - 1];
    const firstPrice = prices[0];

    // Daily returns
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    // CAGR
    const years = prices.length / 252;
    const cagr = Math.pow(latestPrice / firstPrice, 1 / years) - 1;

    // 1Y return
    const oneYearIndex = prices.length - 252;
    const oneYearReturn =
      oneYearIndex > 0
        ? (latestPrice - prices[oneYearIndex]) /
          prices[oneYearIndex]
        : null;

    // Volatility
    const volatility = stdDev(returns) * Math.sqrt(252);

    // Max Drawdown
    const mdd = maxDrawdown(prices);

    // 200 MA
    const ma200 =
      prices.slice(-200).reduce((a, b) => a + b, 0) / 200;

    summary.push({
      ticker,
      latest_price: latestPrice,
      cagr: Number(cagr.toFixed(4)),
      one_year_return:
        oneYearReturn !== null
          ? Number(oneYearReturn.toFixed(4))
          : null,
      volatility: Number(volatility.toFixed(4)),
      max_drawdown: Number(mdd.toFixed(4)),
      above_ma200: latestPrice > ma200
    });
  });

  fs.writeFileSync(
    path.join(snapshotDir, "market_summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log("Market summary exported.");
}

function exportStrategicTables() {
  const importantTables = [
    "goals",
    "holdings",
    "allocations",
    "net_worth_history",
    "buy_rent_inputs",
    "local_market_activity"
  ];

  importantTables.forEach(name => {
    const rows = db.prepare(`SELECT * FROM ${name}`).all();

    fs.writeFileSync(
      path.join(snapshotDir, `${name}.json`),
      JSON.stringify(rows, null, 2)
    );

    console.log(`Exported ${name}`);
  });
}

exportStrategicTables();
exportMarketSummary();
exportRawPriceHistory();


console.log("Strategic snapshot complete.");
