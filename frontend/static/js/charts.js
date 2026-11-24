/* Chart.js helpers with the cosmic styling. */
(function () {
  "use strict";

  function gradient(ctx, area, up) {
    const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, up ? "rgba(61,255,176,0.35)" : "rgba(255,77,125,0.35)");
    g.addColorStop(1, "rgba(123,47,247,0)");
    return g;
  }

  function lineColor(ctx, area, up) {
    const g = ctx.createLinearGradient(area.left, 0, area.right, 0);
    g.addColorStop(0, "#7b2ff7");
    g.addColorStop(1, up ? "#3dffb0" : "#ff4d7d");
    return g;
  }

  /**
   * Draw a price chart.
   * @param {HTMLCanvasElement} canvas
   * @param {{date:string, close:number}[]} history
   * @param {{mini?: boolean, currency?: string}} opts
   */
  function priceChart(canvas, history, opts = {}) {
    const mini = !!opts.mini;
    const closes = history.map((h) => h.close);
    const up = closes.length < 2 || closes[closes.length - 1] >= closes[0];
    const fmt = (v) => window.Cosmos.fmtMoney(v, opts.currency);

    return new Chart(canvas, {
      type: "line",
      data: {
        labels: history.map((h) => h.date),
        datasets: [{
          data: closes,
          borderWidth: mini ? 2 : 3,
          tension: 0.35,
          fill: true,
          pointRadius: mini ? 0 : 2.5,
          pointHoverRadius: 6,
          pointBackgroundColor: "#00d4ff",
          borderColor: (c) => (c.chart.chartArea ? lineColor(c.chart.ctx, c.chart.chartArea, up) : "#7b2ff7"),
          backgroundColor: (c) => (c.chart.chartArea ? gradient(c.chart.ctx, c.chart.chartArea, up) : "transparent"),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900, easing: "easeOutQuart" },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(16,18,43,0.95)",
            borderColor: "rgba(170,120,255,0.55)",
            borderWidth: 1,
            titleColor: "#8f93c4",
            bodyColor: "#e6e8ff",
            displayColors: false,
            callbacks: { label: (c) => fmt(c.parsed.y) },
          },
        },
        scales: {
          x: {
            display: !mini,
            grid: { color: "rgba(140,150,255,0.06)" },
            ticks: { color: "#8f93c4", maxRotation: 0, autoSkipPadding: 18 },
          },
          y: {
            display: !mini,
            grid: { color: "rgba(140,150,255,0.06)" },
            ticks: { color: "#8f93c4", callback: (v) => fmt(v) },
          },
        },
      },
    });
  }

  window.CosmosCharts = { priceChart };
})();
