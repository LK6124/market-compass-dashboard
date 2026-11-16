(function () {
  'use strict';

  function boot(D) {
    if (!D) return;

  var COLORS = {
    red: '#c94832',
    redSoft: 'rgba(201, 72, 50, .16)',
    ink: '#11191e',
    green: '#2d7c63',
    blue: '#366d8d',
    amber: '#b8832f',
    grey: '#8c9598',
    grid: 'rgba(17, 25, 30, .075)',
    axis: 'rgba(17, 25, 30, .20)'
  };
  var charts = {};
  var isMobile = function () { return window.innerWidth <= 820; };
  var $ = function (id) { return document.getElementById(id); };

  function number(value, digits) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return Number(value).toLocaleString('zh-CN', {
      minimumFractionDigits: digits === undefined ? 2 : digits,
      maximumFractionDigits: digits === undefined ? 2 : digits
    });
  }

  function signed(value, digits) {
    var v = Number(value);
    return (v > 0 ? '+' : v < 0 ? '−' : '') + number(Math.abs(v), digits);
  }

  function dateDot(value) {
    return String(value || '').slice(0, 10).replaceAll('-', '.');
  }

  function tail(items, count) {
    return count > 0 ? items.slice(Math.max(0, items.length - count)) : items.slice();
  }

  function average(items) {
    var valid = items.filter(function (item) { return Number.isFinite(Number(item)); });
    return valid.reduce(function (sum, item) { return sum + Number(item); }, 0) / (valid.length || 1);
  }

  function setText(id, value) {
    var element = $(id);
    if (element) element.textContent = value;
  }

  function setClass(id, className) {
    var element = $(id);
    if (element) element.className = className;
  }

  function sparkline(id, values, color) {
    var host = $(id);
    if (!host) return;
    var points = tail(values.filter(function (value) { return Number.isFinite(Number(value)); }), 90);
    if (points.length < 2) return;

    var width = 280;
    var height = 54;
    var pad = 4;
    var min = Math.min.apply(null, points);
    var max = Math.max.apply(null, points);
    var spread = max - min || 1;
    var coords = points.map(function (value, index) {
      return {
        x: pad + index * (width - pad * 2) / (points.length - 1),
        y: height - pad - (Number(value) - min) * (height - pad * 2) / spread
      };
    });

    var line = 'M ' + coords[0].x.toFixed(2) + ' ' + coords[0].y.toFixed(2);
    for (var index = 1; index < coords.length; index += 1) {
      var previous = coords[index - 1];
      var current = coords[index];
      var middle = (previous.x + current.x) / 2;
      line += ' C ' + middle.toFixed(2) + ' ' + previous.y.toFixed(2) + ', ' +
        middle.toFixed(2) + ' ' + current.y.toFixed(2) + ', ' +
        current.x.toFixed(2) + ' ' + current.y.toFixed(2);
    }
    var last = coords[coords.length - 1];
    var gradientId = id + 'Gradient';
    var area = line + ' L ' + last.x.toFixed(2) + ' ' + height + ' L ' + coords[0].x.toFixed(2) + ' ' + height + ' Z';

    host.innerHTML =
      '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" focusable="false" aria-hidden="true">' +
        '<defs><linearGradient id="' + gradientId + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="' + color + '" stop-opacity=".19"></stop>' +
          '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"></stop>' +
        '</linearGradient></defs>' +
        '<path d="' + area + '" fill="url(#' + gradientId + ')"></path>' +
        '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="1.7" stroke-linecap="round"></path>' +
        '<circle cx="' + last.x.toFixed(2) + '" cy="' + last.y.toFixed(2) + '" r="2.7" fill="#fbfaf6" stroke="' + color + '" stroke-width="2"></circle>' +
      '</svg>';
  }

  function populateSummary() {
    var E = D.etf.latest;
    var M = D.margin.latest;
    var R = D.erp.latest;

    setText('generatedAt', dateDot(D.generated).slice(0, 10));
    setText('footerUpdate', '数据快照 ' + D.generated);
    setText('etfDays', number(D.etf.trading_days, 0));
    setText('erpPoints', number(D.erp.meta.points, 0));

    setText('kpiEtf', number(E.ratio, 2));
    setText('etfChange', (E.ratio_chg_pp === 0 ? '— ' : signed(E.ratio_chg_pp, 2) + ' ') + 'pp');
    setText('etfFoot', '合计市值 ' + number(E.etf_mv_total, 0) + ' 亿');
    setText('etfDate', dateDot(E.trade_date));

    setText('kpiMargin', number(M.rz / 10000, 2));
    setText('marginChange', signed(M.rz_chg, 2) + ' 亿');
    setText('marginFoot', '两融合计 ' + number(M.total, 0) + ' 亿');
    setText('marginDate', dateDot(M.date));

    setText('kpiLeverage', number(M.rzyezb, 2));
    setText('leverageFoot', '全A流通市值 ' + number(M.ltsz / 10000, 1) + ' 万亿');
    setText('leverageDate', dateDot(M.date));

    setText('kpiErp', number(R.erp, 2));
    setText('erpChange', (R.z >= 0 ? '高于均线 ' : '低于均线 ') + number(Math.abs(R.z), 2) + 'σ');
    setText('erpFoot', 'PE ' + number(R.pe, 2) + 'x · 10Y ' + number(R.y10, 2) + '%');
    setText('erpDate', dateDot(R.date));

    setClass('etfChange', 'change ' + (E.ratio_chg_pp > 0 ? 'positive' : E.ratio_chg_pp < 0 ? 'negative' : 'neutral'));
    setClass('marginChange', 'change ' + (M.rz_chg > 0 ? 'positive' : M.rz_chg < 0 ? 'negative' : 'neutral'));
    setClass('erpChange', 'change ' + (R.z > 0 ? 'positive' : R.z < 0 ? 'negative' : 'neutral'));

    var leverageAverage = average(tail(D.margin.series.rzyezb, 244));
    var leverageDelta = M.rzyezb - leverageAverage;
    setText('leverageChange', (leverageDelta >= 0 ? '高于' : '低于') + '一年均值 ' + number(Math.abs(leverageDelta), 2) + 'pp');
    setClass('leverageChange', 'change ' + (leverageDelta > 0 ? 'positive' : leverageDelta < 0 ? 'negative' : 'neutral'));

    var etfGap = E.ratio - D.etf.range.ratio_avg;
    setText('snapEtf', '较区间均值' + (etfGap >= 0 ? '高 ' : '低 ') + number(Math.abs(etfGap), 2) + 'pp');
    setText('snapMargin', (M.rz_chg20 >= 0 ? '近 20 日增加 ' : '近 20 日减少 ') + number(Math.abs(M.rz_chg20), 2) + ' 亿');
    setText('snapErp', '处于近十年 ' + number(R.pct, 1) + '% 分位');

    var stateParts = [];
    if (etfGap < 0) stateParts.push('ETF资金配置低于近三年均值');
    else stateParts.push('ETF资金配置高于近三年均值');
    if (M.rz_chg20 < 0) stateParts.push('融资余额较近期高位回落');
    else stateParts.push('融资余额近一个月继续抬升');
    if (R.pct >= 50) stateParts.push('股债利差位于历史偏高分位');
    else stateParts.push('股债利差位于历史偏低分位');
    setText('snapshotTitle', stateParts[0] + '，' + (R.pct >= 50 ? '估值侧相对友好' : '估值侧相对谨慎'));
    setText('snapshotText', stateParts.join('；') + '。');

    sparkline('sparkEtf', tail(D.etf.series.ratio, 90), COLORS.red);
    sparkline('sparkMargin', tail(D.margin.series.rz, 180), COLORS.ink);
    sparkline('sparkLeverage', tail(D.margin.series.rzyezb, 180), COLORS.blue);
    sparkline('sparkErp', tail(D.erp.series.erp, 90), COLORS.amber);
  }

  function tooltipStyle() {
    return {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(20, 28, 33, .96)',
      borderWidth: 0,
      padding: [11, 13],
      textStyle: { color: '#f6f2e9', fontSize: 11.5, lineHeight: 20, fontFamily: 'Aptos, Segoe UI, Microsoft YaHei, sans-serif' },
      extraCssText: 'border-radius:10px;box-shadow:0 16px 36px rgba(17,25,30,.24);',
      axisPointer: {
        type: 'cross',
        lineStyle: { color: 'rgba(17,25,30,.28)', type: 'dashed' },
        crossStyle: { color: 'rgba(17,25,30,.28)' },
        label: { backgroundColor: '#303b40', color: '#fff', fontSize: 10, borderRadius: 3 }
      }
    };
  }

  function legendStyle(items) {
    return {
      show: !isMobile(),
      data: items,
      top: 1,
      right: 0,
      left: 'auto',
      itemWidth: 15,
      itemHeight: 5,
      itemGap: 18,
      icon: 'roundRect',
      textStyle: { color: COLORS.grey, fontSize: 10, fontFamily: 'Aptos, Segoe UI, Microsoft YaHei, sans-serif' }
    };
  }

  function categoryAxis(dates) {
    return {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: COLORS.axis } },
      axisTick: { show: false },
      axisLabel: {
        color: COLORS.grey,
        fontSize: isMobile() ? 9 : 10,
        hideOverlap: true,
        margin: 12,
        formatter: function (value) { return String(value).slice(2).replaceAll('-', '.'); }
      }
    };
  }

  function valueAxis(name, formatter, extra) {
    return Object.assign({
      type: 'value',
      name: isMobile() ? '' : name,
      nameGap: 12,
      nameTextStyle: { color: COLORS.grey, fontSize: 9.5, align: 'left', padding: [0, 0, 0, 0] },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: COLORS.grey, fontSize: isMobile() ? 9 : 10, formatter: formatter, margin: 10 },
      splitLine: { lineStyle: { color: COLORS.grid, type: 'solid' } },
      scale: true
    }, extra || {});
  }

  function zoomInside(showSlider) {
    var result = [{ type: 'inside', filterMode: 'none', zoomOnMouseWheel: true, moveOnMouseMove: true }];
    if (showSlider !== false) {
      result.push({
        type: 'slider',
        height: 14,
        bottom: 0,
        borderColor: 'transparent',
        backgroundColor: 'rgba(17,25,30,.035)',
        fillerColor: 'rgba(201,72,50,.10)',
        handleStyle: { color: '#fbfaf6', borderColor: 'rgba(17,25,30,.24)' },
        dataBackground: { lineStyle: { color: 'rgba(17,25,30,.15)' }, areaStyle: { color: 'rgba(17,25,30,.03)' } },
        selectedDataBackground: { lineStyle: { color: 'rgba(201,72,50,.34)' }, areaStyle: { color: 'rgba(201,72,50,.06)' } },
        textStyle: { color: COLORS.grey, fontSize: 9 },
        moveHandleSize: 0
      });
    }
    return result;
  }

  function etfTooltip(params) {
    var index = params[0].dataIndex;
    var dates = params[0].axisValueArray || [];
    var date = dates[index] || params[0].axisValue;
    var S = window.__chartSlices.etf;
    var ratio = S.ratio[index];
    var previous = index > 0 ? S.ratio[index - 1] : ratio;
    var diff = ratio - previous;
    return '<div style="color:rgba(246,242,233,.5);font-size:10px;letter-spacing:.05em;margin-bottom:5px">' + date + '</div>' +
      '<div style="display:flex;justify-content:space-between;gap:28px"><span style="color:rgba(246,242,233,.6)">ETF合计市值</span><b>' + number(S.mv[index], 0) + ' 亿元</b></div>' +
      '<div style="display:flex;justify-content:space-between;gap:28px"><span style="color:rgba(246,242,233,.6)">占流通市值</span><b style="color:#f58a73">' + number(ratio, 3) + '%</b></div>' +
      '<div style="display:flex;justify-content:space-between;gap:28px"><span style="color:rgba(246,242,233,.6)">当日变化</span><span style="color:' + (diff >= 0 ? '#f58a73' : '#7ddab5') + '">' + signed(diff, 3) + 'pp</span></div>' +
      '<div style="display:flex;justify-content:space-between;gap:28px;margin-top:4px;padding-top:5px;border-top:1px solid rgba(255,255,255,.1)"><span style="color:rgba(246,242,233,.6)">沪深300</span><span>' + number(S.csi[index], 2) + '</span></div>';
  }

  function renderEtf(count) {
    var S = D.etf.series;
    var dates = tail(S.dates, count);
    var ratio = tail(S.ratio, count);
    var csi = tail(S.csi_close, count);
    var marketValue = tail(S.etf_mv, count);
    window.__chartSlices = window.__chartSlices || {};
    window.__chartSlices.etf = { ratio: ratio, mv: marketValue, csi: csi };

    charts.etf.setOption({
      animationDuration: 650,
      animationEasing: 'cubicOut',
      color: [COLORS.red, '#96a0a3'],
      grid: { left: isMobile() ? 8 : 15, right: isMobile() ? 10 : 10, top: 45, bottom: 38, containLabel: true },
      tooltip: Object.assign(tooltipStyle(), { formatter: etfTooltip }),
      legend: legendStyle(['四只ETF合计占流通市值', '沪深300（右轴）']),
      xAxis: categoryAxis(dates),
      yAxis: [
        valueAxis('占比 %', function (value) { return Number(value).toFixed(2); }),
        valueAxis('沪深300', function (value) { return Math.round(value); }, { splitLine: { show: false } })
      ],
      dataZoom: zoomInside(true),
      series: [
        {
          name: '四只ETF合计占流通市值',
          type: 'line',
          data: ratio,
          showSymbol: false,
          symbol: 'circle',
          symbolSize: 6,
          smooth: 0.12,
          lineStyle: { width: 2.4, color: COLORS.red },
          itemStyle: { color: COLORS.red },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(201,72,50,.26)' },
              { offset: 1, color: 'rgba(201,72,50,.015)' }
            ])
          },
          emphasis: { focus: 'series' },
          z: 4
        },
        {
          name: '沪深300（右轴）',
          type: 'line',
          yAxisIndex: 1,
          data: csi,
          showSymbol: false,
          smooth: 0.12,
          lineStyle: { width: 1.4, color: '#96a0a3', type: 'dashed' },
          itemStyle: { color: '#96a0a3' },
          emphasis: { focus: 'series' },
          z: 3
        }
      ]
    }, true);

    var range = D.etf.range;
    setText('etfCurrent', number(D.etf.latest.ratio, 2) + '%');
    setText('etfAverage', number(range.ratio_avg, 2) + '%');
    setText('etfHigh', number(range.max.ratio, 2) + '%');
    setText('etfFootnote', '样本 ' + range.start + ' 至 ' + range.end + '；最高 ' + number(range.max.ratio, 2) + '%（' + dateDot(range.max.date) + '），最低 ' + number(range.min.ratio, 2) + '%（' + dateDot(range.min.date) + '）。分母按点位与当日快照推算，占比为估算值。');
  }

  function marginTooltip(params) {
    var index = params[0].dataIndex;
    var date = params[0].axisValue;
    var S = window.__chartSlices.margin;
    var diff = index > 0 ? S.rz[index] - S.rz[index - 1] : 0;
    return '<div style="color:rgba(246,242,233,.5);font-size:10px;letter-spacing:.05em;margin-bottom:5px">' + date + '</div>' +
      '<div style="display:flex;justify-content:space-between;gap:24px"><span style="color:rgba(246,242,233,.6)">融资余额</span><b>' + number(S.rz[index], 2) + ' 亿</b></div>' +
      '<div style="display:flex;justify-content:space-between;gap:24px"><span style="color:rgba(246,242,233,.6)">当日变化</span><span style="color:' + (diff >= 0 ? '#f58a73' : '#7ddab5') + '">' + signed(diff, 2) + ' 亿</span></div>' +
      '<div style="display:flex;justify-content:space-between;gap:24px"><span style="color:rgba(246,242,233,.6)">融券余额</span><span>' + number(S.rq[index], 2) + ' 亿</span></div>' +
      '<div style="display:flex;justify-content:space-between;gap:24px"><span style="color:rgba(246,242,233,.6)">占流通市值</span><b>' + number(S.ratio[index], 2) + '%</b></div>' +
      '<div style="display:flex;justify-content:space-between;gap:24px;margin-top:4px;padding-top:5px;border-top:1px solid rgba(255,255,255,.1)"><span style="color:rgba(246,242,233,.6)">沪深300</span><b>' + number(S.csi[index], 2) + '</b></div>';
  }

  function renderMargin(count) {
    var S = D.margin.series;
    var dates = tail(S.dates, count);
    var rz = tail(S.rz, count);
    var rq = tail(S.rq, count);
    var ratio = tail(S.rzyezb, count);
    var csi = tail(S.csi_close, count);
    window.__chartSlices.margin = { rz: rz, rq: rq, ratio: ratio, csi: csi };

    charts.margin.setOption({
      animationDuration: 650,
      animationEasing: 'cubicOut',
      grid: { left: isMobile() ? 7 : 10, right: isMobile() ? 5 : 8, top: 42, bottom: 35, containLabel: true },
      tooltip: Object.assign(tooltipStyle(), { formatter: marginTooltip }),
      legend: legendStyle(['融资余额', '融券余额', '占流通市值（右轴）', '沪深300（右轴）']),
      xAxis: categoryAxis(dates),
      yAxis: [
        valueAxis('余额（万亿）', function (value) { return value === 0 ? '0' : (value / 10000).toFixed(1); }),
        valueAxis('占比 %', function (value) { return Number(value).toFixed(1); }, { position: 'right', show: !isMobile(), splitLine: { show: false } }),
        valueAxis('沪深300', function (value) { return Math.round(value); }, { position: 'right', offset: isMobile() ? 0 : 46, splitLine: { show: false } })
      ],
      dataZoom: zoomInside(true),
      series: [
        {
          name: '融资余额',
          type: 'line',
          data: rz,
          showSymbol: false,
          smooth: 0.1,
          lineStyle: { width: 2.2, color: COLORS.ink },
          itemStyle: { color: COLORS.ink },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(17,25,30,.16)' },
              { offset: 1, color: 'rgba(17,25,30,.01)' }
            ])
          },
          emphasis: { focus: 'series' },
          z: 4
        },
        {
          name: '融券余额',
          type: 'line',
          data: rq,
          showSymbol: false,
          smooth: 0.1,
          lineStyle: { width: 1.2, color: COLORS.amber, opacity: 0.8 },
          itemStyle: { color: COLORS.amber },
          z: 3
        },
        {
          name: '占流通市值（右轴）',
          type: 'line',
          yAxisIndex: 1,
          data: ratio,
          showSymbol: false,
          smooth: 0.1,
          lineStyle: { width: 1.45, color: COLORS.blue, type: 'dashed' },
          itemStyle: { color: COLORS.blue },
          z: 2
        },
        {
          name: '沪深300（右轴）',
          type: 'line',
          yAxisIndex: 2,
          data: csi,
          showSymbol: false,
          smooth: 0.12,
          lineStyle: { width: 1.35, color: '#929b9e', type: 'dashed', opacity: 0.9 },
          itemStyle: { color: '#929b9e' },
          emphasis: { focus: 'series' },
          z: 3
        }
      ]
    }, true);

    var M = D.margin.latest;
    setText('marginCurrent', number(M.rz / 10000, 2) + ' 万亿');
    setText('marginRatio', number(M.rzyezb, 2) + '%');
    setText('margin20', (M.rz_chg20 >= 0 ? '+' : '−') + number(Math.abs(M.rz_chg20), 2) + ' 亿');
    setClass('margin20', M.rz_chg20 >= 0 ? 'up' : 'down');
    setText('marginFootnote', '最新 ' + M.date + '（T+1 披露）；区间峰值 ' + number(D.margin.range.max.rz, 0) + ' 亿，出现于 ' + dateDot(D.margin.range.max.date) + '。沪深300采用右侧独立坐标轴。');
  }

  function erpTooltip(params) {
    var index = params[0].dataIndex;
    var date = params[0].axisValue;
    var S = window.__chartSlices.erp;
    var z = S.ma[index] !== null ? (S.erp[index] - S.ma[index]) / ((S.upper[index] - S.ma[index]) / 2) : null;
    return '<div style="color:rgba(246,242,233,.5);font-size:10px;letter-spacing:.05em;margin-bottom:5px">' + date + '</div>' +
      '<div style="display:flex;justify-content:space-between;gap:25px"><span style="color:rgba(246,242,233,.6)">股债利差</span><b style="color:#f0b85e">' + number(S.erp[index], 2) + '%</b></div>' +
      '<div style="display:flex;justify-content:space-between;gap:25px"><span style="color:rgba(246,242,233,.6)">2.5年均线</span><span>' + number(S.ma[index], 2) + '%</span></div>' +
      '<div style="display:flex;justify-content:space-between;gap:25px"><span style="color:rgba(246,242,233,.6)">偏离均线</span><span>' + (z === null ? '—' : signed(z, 2) + 'σ') + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;gap:25px"><span style="color:rgba(246,242,233,.6)">沪深300</span><b>' + number(S.csi[index], 2) + '</b></div>' +
      '<div style="margin-top:4px;padding-top:5px;border-top:1px solid rgba(255,255,255,.1);color:rgba(246,242,233,.56);font-size:10px">PE(TTM) ' + number(S.pe[index], 2) + ' · 10Y国债 ' + number(S.y10[index], 2) + '%</div>';
  }

  function renderErp(count) {
    var S = D.erp.series;
    var dates = tail(S.dates, count);
    var erp = tail(S.erp, count);
    var ma = tail(S.ma, count);
    var upper = tail(S.upper, count);
    var lower = tail(S.lower, count);
    var pe = tail(S.pe, count);
    var y10 = tail(S.y10, count);
    var csi = tail(S.csi_close, count);
    var band = upper.map(function (value, index) {
      return value === null || lower[index] === null ? null : Number((value - lower[index]).toFixed(3));
    });
    window.__chartSlices.erp = { erp: erp, ma: ma, upper: upper, lower: lower, pe: pe, y10: y10, csi: csi };

    charts.erp.setOption({
      animationDuration: 650,
      animationEasing: 'cubicOut',
      grid: { left: isMobile() ? 7 : 10, right: isMobile() ? 5 : 8, top: 42, bottom: 35, containLabel: true },
      tooltip: Object.assign(tooltipStyle(), { formatter: erpTooltip }),
      legend: legendStyle(['股债利差', '2.5年均线', '±2σ 区间', '沪深300（右轴）']),
      xAxis: categoryAxis(dates),
      yAxis: [
        valueAxis('利差 %', function (value) { return Number(value).toFixed(1); }),
        valueAxis('沪深300', function (value) { return Math.round(value); }, { position: 'right', splitLine: { show: false } })
      ],
      dataZoom: zoomInside(true),
      series: [
        {
          name: '__band_base',
          type: 'line',
          stack: 'band',
          data: lower,
          showSymbol: false,
          smooth: 0.2,
          lineStyle: { opacity: 0 },
          areaStyle: { opacity: 0 },
          silent: true,
          emphasis: { disabled: true },
          legendHoverLink: false
        },
        {
          name: '±2σ 区间',
          type: 'line',
          stack: 'band',
          data: band,
          showSymbol: false,
          smooth: 0.2,
          lineStyle: { opacity: 0 },
          areaStyle: { color: 'rgba(184,131,47,.14)' },
          itemStyle: { color: 'rgba(184,131,47,.18)' },
          silent: true,
          emphasis: { disabled: true },
          legendHoverLink: false,
          z: 1
        },
        {
          name: '2.5年均线',
          type: 'line',
          data: ma,
          showSymbol: false,
          smooth: 0.2,
          lineStyle: { width: 1.3, color: COLORS.blue, type: 'dashed' },
          itemStyle: { color: COLORS.blue },
          z: 3
        },
        {
          name: '股债利差',
          type: 'line',
          data: erp,
          showSymbol: false,
          smooth: 0.15,
          lineStyle: { width: 2.1, color: COLORS.amber },
          itemStyle: { color: COLORS.amber },
          emphasis: { focus: 'series' },
          z: 5
        },
        {
          name: '沪深300（右轴）',
          type: 'line',
          yAxisIndex: 1,
          data: csi,
          showSymbol: false,
          smooth: 0.12,
          lineStyle: { width: 1.35, color: '#929b9e', type: 'dashed', opacity: 0.9 },
          itemStyle: { color: '#929b9e' },
          emphasis: { focus: 'series' },
          z: 4
        }
      ]
    }, true);

    var R = D.erp.latest;
    setText('erpCurrent', number(R.erp, 2) + '%');
    setText('erpPercentile', number(R.pct, 1) + '%');
    setText('erpZ', signed(R.z, 2) + 'σ');
    setText('erpFootnote', '样本 ' + D.erp.meta.start + ' 至 ' + D.erp.meta.end + '，' + D.erp.meta.freq.replace('weekly', '周频') + '；均线与 ±2σ 均为 2.5 年滚动窗口，沪深300采用右侧独立坐标轴。');
  }

  function bindRange(id, render) {
    var control = $(id);
    if (!control) return;
    control.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button || button.classList.contains('active')) return;
      control.querySelectorAll('button').forEach(function (item) { item.classList.remove('active'); });
      button.classList.add('active');
      render(Number(button.dataset.points));
    });
  }

  function renderMethods() {
    var host = $('methodList');
    var labels = ['ETF 配置', '两融余额', '股债利差', '涨跌配色'];
    host.innerHTML = (D.notes || []).map(function (note, index) {
      var content = note.replace(/^模块[一二三四]：/, '').replace(/^涨跌配色：/, '');
      return '<div class="method-item"><span>0' + (index + 1) + '</span><p><b style="color:rgba(244,241,232,.9);font-weight:600">' + labels[index] + '。</b>' + content + '</p></div>';
    }).join('');
  }

  function addRevealAnimations() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var targets = document.querySelectorAll('.kpi-card, .chart-section, .method-section');
    targets.forEach(function (target) { target.classList.add('reveal'); });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    targets.forEach(function (target) { observer.observe(target); });
  }

  function initCharts() {
    charts.etf = echarts.init($('chartEtf'), null, { renderer: 'canvas' });
    charts.margin = echarts.init($('chartMargin'), null, { renderer: 'canvas' });
    charts.erp = echarts.init($('chartErp'), null, { renderer: 'canvas' });

    renderEtf(0);
    renderMargin(244);
    renderErp(516);

    bindRange('etfRange', renderEtf);
    bindRange('marginRange', renderMargin);
    bindRange('erpRange', renderErp);

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        Object.keys(charts).forEach(function (key) { charts[key].resize(); });
      }, 120);
    });
  }

  function init() {
    populateSummary();
    renderMethods();
    addRevealAnimations();
    initCharts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  }

  function loadDashboard() {
    if (location.protocol === 'file:') {
      boot(window.DASHBOARD_DATA);
      return;
    }
    fetch('./data.json?ts=' + Date.now(), { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(boot)
      .catch(function (error) {
        if (window.DASHBOARD_DATA) {
          boot(window.DASHBOARD_DATA);
          return;
        }
        var stamp = document.getElementById('generatedAt');
        if (stamp) stamp.textContent = '数据加载失败';
        console.error('数据加载失败', error);
      });
  }

  loadDashboard();
})();

