'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA_JSON = path.join(ROOT, 'data.json');
const DATA_JS = path.join(ROOT, 'data.js');
const ETF_CODES = ['510300', '510310', '510330', '159919'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
          ...(options.headers || {})
        },
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 1000);
    }
  }
  throw lastError;
}

async function fetchBuffer(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
          ...(options.headers || {})
        },
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 1000);
    }
  }
  throw lastError;
}
async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}

function shanghaiDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

function shanghaiTimestamp(value = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(value).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function isoWeekStart(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function round(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

function assertFinite(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} 数值异常：${value}`);
  }
}

function parseTencentLine(text, quoteKey) {
  const match = text.match(new RegExp(`v_${quoteKey}="([^"]*)"`));
  if (!match) throw new Error(`腾讯行情缺少 ${quoteKey}`);
  const fields = match[1].split('~');
  return {
    name: fields[1],
    code: fields[2],
    price: Number(fields[3]),
    previousClose: Number(fields[4]),
    open: Number(fields[5]),
    timestamp: fields[30],
    changePct: Number(fields[32]),
    high: Number(fields[33]),
    low: Number(fields[34]),
    marketCap: Number(fields[44]),
    shares: Number(fields[73]),
    date: `${fields[30].slice(0, 4)}-${fields[30].slice(4, 6)}-${fields[30].slice(6, 8)}`
  };
}

async function fetchMarketSnapshot() {
  const quoteKeys = ETF_CODES.map((code) => `${code.startsWith('5') ? 'sh' : 'sz'}${code}`);
  const url = `https://qt.gtimg.cn/q=${quoteKeys.concat('sh000300').join(',')}`;
  const text = new TextDecoder('gbk').decode(
    await fetchBuffer(url, { headers: { referer: 'https://gu.qq.com/' } })
  );

  const etfs = {};
  for (const key of quoteKeys) {
    const quote = parseTencentLine(text, key);
    assertFinite(quote.price, `${quote.code} 价格`, 0.1, 100);
    assertFinite(quote.marketCap, `${quote.code} 市值`, 1, 100000);
    etfs[quote.code] = quote;
  }
  const csi = parseTencentLine(text, 'sh000300');
  assertFinite(csi.price, '沪深300点位', 100, 20000);
  assertFinite(csi.marketCap, '沪深300流通市值', 1000, 5000000);
  return { etfs, csi };
}

async function fetchMarginRows() {
  const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_RZRQ_LSHJ&columns=ALL&source=WEB&client=WEB&pageNumber=1&pageSize=30&sortColumns=DIM_DATE&sortTypes=-1';
  const payload = await fetchJson(url, { headers: { referer: 'https://data.eastmoney.com/' } });
  if (!payload.success || !payload.result || !Array.isArray(payload.result.data)) {
    throw new Error(`两融接口异常：${payload.message || '无数据'}`);
  }
  return payload.result.data.map((row) => ({
    date: row.DIM_DATE.slice(0, 10),
    rz: row.RZYE / 100000000,
    rq: row.RQYE / 100000000,
    total: row.RZRQYE / 100000000,
    ltsz: row.LTSZ / 100000000,
    rzyezb: Number(row.RZYEZB),
    rz_chg: row.RZJME / 100000000,
    csi: Number(row.NEW)
  }));
}

async function fetchMarginCsiHistory() {
  const base = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_RZRQ_LSHJ&columns=DIM_DATE%2CNEW&source=WEB&client=WEB&pageSize=800&sortColumns=DIM_DATE&sortTypes=-1';
  const first = await fetchJson(base + '&pageNumber=1', { headers: { referer: 'https://data.eastmoney.com/' } });
  if (!first.success || !first.result || !Array.isArray(first.result.data)) {
    throw new Error('沪深300历史行情接口异常');
  }
  const pages = Math.ceil(first.result.count / first.result.data.length);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
    fetchJson(base + '&pageNumber=' + (index + 2), { headers: { referer: 'https://data.eastmoney.com/' } })
  ));
  const rows = first.result.data.concat(...rest.map((payload) => payload.result.data));
  return new Map(rows.map((row) => [row.DIM_DATE.slice(0, 10), Number(row.NEW)]));
}

function previousValue(map, date) {
  if (map.has(date)) return map.get(date);
  let candidate = null;
  for (const [key, value] of map) {
    if (key <= date && (!candidate || key > candidate[0])) candidate = [key, value];
  }
  return candidate ? candidate[1] : null;
}

async function ensureCsiHistory(data) {
  const margin = data.margin.series;
  const needsMargins = !Array.isArray(margin.csi_close) || margin.csi_close.length !== margin.dates.length;
  const erp = data.erp.series;
  const needsErp = !Array.isArray(erp.csi_close) || erp.csi_close.length !== erp.dates.length;
  if (!needsMargins && !needsErp) return;

  const history = await fetchMarginCsiHistory();
  const values = margin.dates.map((date) => {
    const value = history.get(date);
    return Number.isFinite(value) ? round(value, 4) : null;
  });
  const coverage = values.filter(Number.isFinite).length / values.length;
  if (coverage < 0.98) throw new Error('沪深300历史行情覆盖率不足：' + (coverage * 100).toFixed(1) + '%');
  margin.csi_close = values;

  erp.csi_close = erp.dates.map((date) => {
    const value = previousValue(history, date);
    return Number.isFinite(value) ? round(value, 4) : null;
  });
}

async function fetchValuationSnapshot() {
  const history = await fetchJson('https://danjuanfunds.com/djapi/index_eva/pe_history/SH000300?day=all', {
    headers: { referer: 'https://danjuanfunds.com/' }
  });
  const points = history?.data?.index_eva_pe_growths;
  if (!Array.isArray(points) || points.length === 0) throw new Error('蛋卷 PE 历史接口无数据');
  const latestPe = points[points.length - 1];

  const treasury = await fetchJson('https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_WEB_TREASURYYIELD&columns=ALL&source=WEB&client=WEB&pageNumber=1&pageSize=3&sortColumns=SOLAR_DATE&sortTypes=-1', {
    headers: { referer: 'https://data.eastmoney.com/' }
  });
  const yieldRow = treasury?.result?.data?.[0];
  if (!yieldRow || !Number.isFinite(Number(yieldRow.EMM00166466))) throw new Error('国债收益率接口无数据');

  return {
    pe: Number(latestPe.pe),
    peDate: shanghaiDate(latestPe.ts),
    y10: Number(yieldRow.EMM00166466),
    y10Date: yieldRow.SOLAR_DATE.slice(0, 10)
  };
}

function upsertPoint(series, date, values) {
  const index = series.dates.indexOf(date);
  if (index >= 0) {
    for (const [key, value] of Object.entries(values)) series[key][index] = value;
    return;
  }
  const insertion = series.dates.findIndex((item) => item > date);
  const position = insertion < 0 ? series.dates.length : insertion;
  series.dates.splice(position, 0, date);
  for (const [key, value] of Object.entries(values)) {
    if (!Array.isArray(series[key])) series[key] = [];
    series[key].splice(position, 0, value);
  }
}

function updateEtf(data, market) {
  const etfValues = {};
  let total = 0;
  for (const code of ETF_CODES) {
    const quote = market.etfs[code];
    if (!quote) throw new Error("缺少 ETF 行情：" + code + "，实际返回 " + Object.keys(market.etfs).join(","));
    etfValues[code] = round(quote.marketCap, 2);
    total += quote.marketCap;
  }
  total = round(total, 2);
  const ratio = round(total / market.csi.marketCap * 100, 4);
  assertFinite(ratio, 'ETF 占比', 0.01, 20);

  const tradeDate = market.csi.date;
  const series = data.etf.series;
  upsertPoint(series, tradeDate, {
    ratio,
    etf_mv: total,
    csi_close: round(market.csi.price, 4),
    csi_ff_mv: round(market.csi.marketCap, 2)
  });

  const index = series.dates.indexOf(tradeDate);
  const previousRatio = index > 0 ? series.ratio[index - 1] : ratio;
  data.etf.latest = {
    trade_date: tradeDate,
    etf_mv_total: total,
    etf_mv_by_code: etfValues,
    ratio,
    ratio_2dp: round(ratio, 2),
    ratio_prev: round(previousRatio, 4),
    ratio_chg_pp: round(ratio - previousRatio, 4),
    csi_close: round(market.csi.price, 4),
    csi_ff_mv: round(market.csi.marketCap, 2),
    csi_close_prev: round(market.csi.previousClose, 4),
    csi_chg_pct: round(market.csi.changePct, 4)
  };
  data.etf.range = {
    start: series.dates[0],
    end: series.dates[series.dates.length - 1],
    trading_days: series.dates.length,
    max: { date: series.dates[indexOfMax(series.ratio)], ratio: Math.max(...series.ratio) },
    min: { date: series.dates[indexOfMin(series.ratio)], ratio: Math.min(...series.ratio) },
    ratio_avg: round(series.ratio.reduce((sum, value) => sum + value, 0) / series.ratio.length, 4)
  };
}

function indexOfMax(values) {
  return values.reduce((best, value, index) => value > values[best] ? index : best, 0);
}

function indexOfMin(values) {
  return values.reduce((best, value, index) => value < values[best] ? index : best, 0);
}

function updateMargin(data, rows) {
  if (rows.length < 21) throw new Error('两融接口返回的历史行不足 21 条');
  const series = data.margin.series;
  for (const row of rows.slice().reverse()) {
    upsertPoint(series, row.date, {
      rz: round(row.rz, 4), rq: round(row.rq, 4), total: round(row.total, 4), rzyezb: round(row.rzyezb, 4), csi_close: round(row.csi, 4)
    });
  }

  const latest = rows[0];
  const previous = rows[1];
  const twentyDaysAgo = rows[20];
  assertFinite(latest.rz, '融资余额', 100, 100000);
  assertFinite(latest.csi, '沪深300点位', 100, 20000);
  assertFinite(latest.rzyezb, '融资余额占比', 0.1, 20);
  data.margin.latest = {
    date: latest.date,
    rz: round(latest.rz, 4),
    rq: round(latest.rq, 4),
    total: round(latest.total, 4),
    ltsz: round(latest.ltsz, 4),
    rzyezb: round(latest.rzyezb, 4),
    rz_chg: round(latest.rz - previous.rz, 4),
    rz_chg_pct: round((latest.rz / previous.rz - 1) * 100, 4),
    rz_chg20: round(latest.rz - twentyDaysAgo.rz, 4)
  };
  const maxIndex = indexOfMax(series.rz);
  const minIndex = indexOfMin(series.rz);
  data.margin.range = {
    start: series.dates[0],
    end: series.dates[series.dates.length - 1],
    days: series.dates.length,
    max: { date: series.dates[maxIndex], rz: series.rz[maxIndex] },
    min: { date: series.dates[minIndex], rz: series.rz[minIndex] }
  };
}

function updateErp(data, valuation, fallbackDate, csiClose) {
  const date = valuation.peDate === valuation.y10Date ? valuation.peDate : fallbackDate;
  if (valuation.peDate !== valuation.y10Date) {
    console.warn(`估值日期不一致：PE ${valuation.peDate}，10Y ${valuation.y10Date}，使用交易日 ${date}`);
  }
  const erp = round(100 / valuation.pe - valuation.y10, 4);
  assertFinite(erp, '股债利差', 0, 20);

  const series = data.erp.series;
  const lastDate = series.dates[series.dates.length - 1];
  let targetIndex;
  if (date >= lastDate) {
    if (isoWeekStart(date) === isoWeekStart(lastDate)) {
      targetIndex = series.dates.length - 1;
      series.dates[targetIndex] = date;
      series.erp[targetIndex] = erp;
      series.pe[targetIndex] = valuation.pe;
      series.y10[targetIndex] = valuation.y10;
      series.csi_close[targetIndex] = round(csiClose, 4);
    } else {
      series.dates.push(date);
      series.erp.push(erp);
      series.pe.push(valuation.pe);
      series.y10.push(valuation.y10);
      series.csi_close.push(round(csiClose, 4));
      targetIndex = series.dates.length - 1;
    }
  } else {
    targetIndex = series.dates.indexOf(date);
    if (targetIndex < 0) targetIndex = series.dates.length - 1;
    series.erp[targetIndex] = erp;
    series.pe[targetIndex] = valuation.pe;
    series.y10[targetIndex] = valuation.y10;
    series.csi_close[targetIndex] = round(csiClose, 4);
  }

  const rolling = series.erp.slice(Math.max(0, targetIndex - 129), targetIndex + 1);
  const mean = rolling.reduce((sum, value) => sum + value, 0) / rolling.length;
  const std = Math.sqrt(rolling.reduce((sum, value) => sum + (value - mean) ** 2, 0) / rolling.length);
  series.ma[targetIndex] = round(mean, 4);
  series.upper[targetIndex] = round(mean + 2 * std, 4);
  series.lower[targetIndex] = round(mean - 2 * std, 4);

  const percentile = series.erp.filter((value) => value <= erp).length / series.erp.length * 100;
  data.erp.latest = {
    date,
    pe: valuation.pe,
    ey: round(100 / valuation.pe, 4),
    y10: valuation.y10,
    erp,
    ma: series.ma[targetIndex],
    upper: series.upper[targetIndex],
    lower: series.lower[targetIndex],
    std: round(std, 4),
    z: round(std ? (erp - mean) / std : 0, 4),
    pct: round(percentile, 2),
    erp_chg: round(erp - (targetIndex > 0 ? series.erp[targetIndex - 1] : erp), 4)
  };
  data.erp.meta.start = series.dates[0];
  data.erp.meta.end = series.dates[series.dates.length - 1];
  data.erp.meta.points = series.dates.length;
}

function writeData(data) {
  const json = JSON.stringify(data, null, 2) + '\n';
  const js = 'window.DASHBOARD_DATA = ' + JSON.stringify(data) + ';\n';
  fs.writeFileSync(DATA_JSON + '.tmp', json, 'utf8');
  fs.writeFileSync(DATA_JS + '.tmp', js, 'utf8');
  fs.renameSync(DATA_JSON + '.tmp', DATA_JSON);
  fs.renameSync(DATA_JS + '.tmp', DATA_JS);
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_JSON, 'utf8'));
  const [market, marginRows, valuation] = await Promise.all([
    fetchMarketSnapshot(),
    fetchMarginRows(),
    fetchValuationSnapshot()
  ]);

  await ensureCsiHistory(data);
  updateEtf(data, market);
  updateMargin(data, marginRows);
  updateErp(data, valuation, market.csi.date, market.csi.price);
  data.generated = shanghaiTimestamp();
  writeData(data);

  console.log(JSON.stringify({
    generated: data.generated,
    etf: {
      date: data.etf.latest.trade_date,
      ratio: data.etf.latest.ratio,
      points: data.etf.trading_days
    },
    margin: {
      date: data.margin.latest.date,
      rz: data.margin.latest.rz,
      points: data.margin.range.days
    },
    erp: {
      date: data.erp.latest.date,
      value: data.erp.latest.erp,
      points: data.erp.meta.points
    }
  }, null, 2));
}

main().catch((error) => {
  console.error('自动更新失败，已保留上一次数据：', error.stack || error.message);
  process.exit(1);
});





