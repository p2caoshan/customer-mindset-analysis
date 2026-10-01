const COLORS = {
  grey: "#BFBEBD",
  beige: "#dde6ed",
  blue: "#9fcce0",
  green: "#cfd9c7",
  pink: "#f2d4d0",
  mauve: "#B7A9B3",
};

const PLOT_LAYOUT = {
  font: { family: "Inter, sans-serif", color: "#555" },
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  margin: { t: 30, r: 20, b: 50, l: 60 },
  legend: { orientation: "h", x: 0, y: 1.12 },
};

const PLOT_CONFIG = { responsive: true, displayModeBar: false };

function theme(extra) {
  return Object.assign({}, PLOT_LAYOUT, extra || {}, {
    xaxis: Object.assign(
      { gridcolor: "#f0f0f0", zerolinecolor: "#f0f0f0" },
      extra && extra.xaxis
    ),
    yaxis: Object.assign(
      { gridcolor: "#f0f0f0", zerolinecolor: "#f0f0f0" },
      extra && extra.yaxis
    ),
  });
}

function formatNumber(value, digits) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function table(headers, rows) {
  const head = headers.map((header) => `<th>${header.label}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = headers
        .map((header) => {
          const raw = row[header.key];
          const text =
            header.digits === undefined ? raw : formatNumber(raw, header.digits);
          return `<td>${text}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function kpi(value, label, tone) {
  return `<div class="kpi ${tone}"><div class="value">${value}</div><div class="label">${label}</div></div>`;
}

function renderOverview(data) {
  const top = data.kpis.top_kpis;
  const cards = [
    kpi(formatNumber(data.kpis.avg_sales, 1), "Average Sales", "teal"),
  ];
  if (top[0]) {
    cards.push(
      kpi(
        formatNumber(top[0].max_correlation, 3),
        `Top Driver: ${top[0].mindset_metric}`,
        "green"
      )
    );
  }
  if (top[1]) {
    cards.push(
      kpi(
        formatNumber(top[1].max_correlation, 3),
        `Secondary Driver: ${top[1].mindset_metric}`,
        "mauve"
      )
    );
  }
  document.getElementById("overview-kpis").innerHTML = cards.join("");

  Plotly.newPlot(
    "sales-trend",
    [
      {
        x: data.series.time,
        y: data.series.sales,
        type: "scatter",
        mode: "lines",
        name: "Sales",
        line: { color: COLORS.blue, width: 3 },
        fill: "tozeroy",
        fillcolor: "rgba(153, 185, 198, 0.2)",
      },
    ],
    theme({
      xaxis: { title: "Sequence / Trend" },
      yaxis: { title: "Volume" },
    }),
    PLOT_CONFIG
  );

  document.getElementById("kpi-table").innerHTML = table(
    [
      { key: "mindset_metric", label: "Mindset metric" },
      { key: "max_correlation", label: "Max correlation", digits: 3 },
      { key: "optimal_lag_weeks", label: "Optimal lag (weeks)", digits: 0 },
    ],
    data.kpis.best_predictors
  );

  document.getElementById("criteria-table").innerHTML = table(
    [
      { key: "metric", label: "Metric" },
      { key: "potential", label: "Potential", digits: 2 },
      { key: "stickiness", label: "Stickiness", digits: 2 },
      { key: "conversion_coefficient", label: "Conversion", digits: 2 },
    ],
    data.criteria
  );
}

function renderFunnel(data) {
  Plotly.newPlot(
    "funnel-plot",
    [
      {
        type: "funnel",
        y: data.funnel.map((row) => row.stage),
        x: data.funnel.map((row) => row.value),
        texttemplate: "%{value:,.2f}",
        textinfo: "text",
        insidetextfont: { color: "black" },
        marker: {
          color: ["#F0F4F8", "#99B9C6", "#4F7380"].slice(0, data.funnel.length),
          line: { width: 2, color: "white" },
        },
        connector: { line: { color: "#e8e8e8", width: 1 } },
      },
    ],
    Object.assign({}, PLOT_LAYOUT, {
      title: { text: "Customer Mindset Funnel", x: 0.5 },
      funnelgap: 0.05,
      margin: { t: 40, r: 30, b: 30, l: 120 },
    }),
    PLOT_CONFIG
  );

  document.getElementById("conversion-table").innerHTML = table(
    [
      { key: "mindset_metric", label: "Mindset metric" },
      { key: "conversion_coefficient", label: "Conversion coefficient", digits: 4 },
    ],
    data.conversion
  );

  const metrics = [...new Set(data.elasticity.map((row) => row.metric))];
  const channels = [...new Set(data.elasticity.map((row) => row.channel))];
  const z = metrics.map((metric) =>
    channels.map((channel) => {
      const found = data.elasticity.find(
        (row) => row.metric === metric && row.channel === channel
      );
      return found ? found.elasticity : null;
    })
  );
  Plotly.newPlot(
    "elasticity-plot",
    [
      {
        x: channels,
        y: metrics,
        z: z,
        type: "heatmap",
        colorscale: [
          [0, COLORS.blue],
          [1, COLORS.pink],
        ],
        hovertemplate: "%{y} / %{x}: %{z:.4f}<extra></extra>",
      },
    ],
    theme({
      margin: { t: 20, r: 20, b: 100, l: 120 },
    }),
    PLOT_CONFIG
  );
}

function renderEffects(data) {
  const channels = data.effects.map((row) => row.marketing_variable);
  Plotly.newPlot(
    "effects-plot",
    [
      {
        x: channels,
        y: data.effects.map((row) => row.direct_effect),
        name: "direct_effect",
        type: "bar",
        marker: { color: "#F0F4F8" },
      },
      {
        x: channels,
        y: data.effects.map((row) => row.indirect_effect),
        name: "indirect_effect",
        type: "bar",
        marker: { color: "#99B9C6" },
      },
    ],
    theme({
      barmode: "stack",
      xaxis: { title: "Marketing Channel" },
      yaxis: { title: "Effect Size" },
    }),
    PLOT_CONFIG
  );

  document.getElementById("effects-table").innerHTML = table(
    [
      { key: "marketing_variable", label: "Channel" },
      { key: "direct_effect", label: "Direct", digits: 3 },
      { key: "indirect_effect", label: "Indirect", digits: 3 },
      { key: "total_effect", label: "Total", digits: 3 },
      { key: "indirect_percentage", label: "Indirect %", digits: 3 },
    ],
    data.effects
  );
}

function renderEfficiency(data) {
  const metrics = [...new Set(data.appeal.map((row) => row.mindset_metric))];
  const channels = [...new Set(data.appeal.map((row) => row.marketing_channel))];
  const z = metrics.map((metric) =>
    channels.map((channel) => {
      const found = data.appeal.find(
        (row) => row.mindset_metric === metric && row.marketing_channel === channel
      );
      return found ? found.appeal : null;
    })
  );
  Plotly.newPlot(
    "appeal-heatmap",
    [
      {
        x: channels,
        y: metrics,
        z: z,
        type: "heatmap",
        colorscale: [
          [0, COLORS.beige],
          [0.5, COLORS.green],
          [1, COLORS.blue],
        ],
        hovertemplate: "%{y} / %{x}: %{z:.4f}<extra></extra>",
      },
    ],
    theme({ margin: { t: 20, r: 20, b: 110, l: 120 } }),
    PLOT_CONFIG
  );

  const ranked = [...data.total_appeal].sort((a, b) => a.total_appeal - b.total_appeal);
  Plotly.newPlot(
    "appeal-bar",
    [
      {
        x: ranked.map((row) => row.total_appeal),
        y: ranked.map((row) => row.marketing_channel),
        type: "bar",
        orientation: "h",
        marker: { color: COLORS.mauve },
      },
    ],
    theme({
      xaxis: { title: "Total Score" },
      yaxis: { title: "" },
      margin: { t: 20, r: 20, b: 50, l: 130 },
    }),
    PLOT_CONFIG
  );

  const wide = channels.map((channel) => {
    const row = { marketing_channel: channel };
    metrics.forEach((metric) => {
      const found = data.appeal.find(
        (item) => item.marketing_channel === channel && item.mindset_metric === metric
      );
      row[metric] = found ? found.appeal : null;
    });
    return row;
  });
  document.getElementById("appeal-table").innerHTML = table(
    [
      { key: "marketing_channel", label: "Channel" },
      ...metrics.map((metric) => ({ key: metric, label: metric, digits: 3 })),
    ],
    wide
  );

  const variables = [...new Set(data.lag_results.map((row) => row.variable))];
  const palette = [COLORS.blue, COLORS.green, COLORS.mauve, COLORS.pink, COLORS.grey];
  Plotly.newPlot(
    "lag-plot",
    variables.map((variable, index) => {
      const rows = data.lag_results
        .filter((row) => row.variable === variable)
        .sort((a, b) => a.lag_period - b.lag_period);
      return {
        x: rows.map((row) => row.lag_period),
        y: rows.map((row) => row.coefficient),
        name: variable,
        type: "scatter",
        mode: "lines+markers",
        line: { width: 2, color: palette[index % palette.length] },
        marker: { size: 8 },
      };
    }),
    theme({
      title: {
        text: "Distributed Lag Effects: Marketing Impact Over Time",
        x: 0.02,
      },
      xaxis: { title: "Lag (Weeks)", dtick: 1 },
      yaxis: {
        title: "Elasticity (Coefficient)",
        zeroline: true,
        zerolinecolor: "black",
        zerolinewidth: 1,
      },
      margin: { t: 50, r: 20, b: 50, l: 60 },
    }),
    PLOT_CONFIG
  );
}

function scenarioImpact(sim, spending) {
  const rows = [];
  sim.mindset_cols.forEach((metric) => {
    rows.push(impactRow(sim, metric, spending, true));
  });
  rows.push(impactRow(sim, sim.sales_col, spending, false));
  return rows;
}

function impactRow(sim, target, spending, isMindset) {
  const model = sim.models[target];
  const baseline = model.baseline;
  let next = baseline;
  Object.keys(spending).forEach((channel) => {
    const elasticity = model.elasticities[channel];
    const baseSpend = sim.baseline_spending[channel];
    if (elasticity === undefined || !baseSpend) return;
    const ratio = spending[channel] / baseSpend;
    if (ratio > 0) next *= Math.pow(ratio, elasticity);
  });
  const shortGain = next / baseline - 1;
  let carryover = model.carryover;
  if (carryover > 0.95 || carryover < 0) carryover = 0;
  const longGain = shortGain / (1 - carryover);
  let contribution = null;
  if (isMindset) {
    const conversion = sim.conversion[target] || 0;
    contribution = longGain * conversion;
  }
  return {
    item: target,
    baseline: baseline,
    new_value: next,
    short_run_gain: shortGain,
    long_run_gain: longGain,
    contribution: contribution,
  };
}

function renderScenario(sim, spending) {
  const rows = scenarioImpact(sim, spending);
  const sales = rows.find((row) => row.item === sim.sales_col);
  let salesLabel = "$0";
  let salesTone = "blue";
  if (sales) {
    const gain = Math.round(sales.new_value - sales.baseline);
    const formatted = formatNumber(Math.abs(gain), 0);
    if (gain >= 0) {
      salesLabel = `+$${formatted}`;
      salesTone = "green";
    } else {
      salesLabel = `-$${formatted}`;
      salesTone = "pink";
    }
  }

  let mindsetLabel = "0%";
  if (sales && Math.abs(sales.long_run_gain) > 0.0001) {
    const mindset = rows
      .filter((row) => sim.mindset_cols.includes(row.item))
      .reduce((sum, row) => sum + (row.contribution || 0), 0);
    mindsetLabel = `${Math.round((mindset / sales.long_run_gain) * 100)}%`;
  }

  document.getElementById("scenario-kpis").innerHTML = [
    kpi(salesLabel, "Projected Revenue Gain ($)", salesTone),
    kpi(mindsetLabel, "Sales Gain via Mindset Route", "mauve"),
  ].join("");

  const baseline = sales ? sales.baseline : 0;
  const totalGain = sales ? sales.new_value - baseline : 0;
  const mindsetPct = rows
    .filter((row) => sim.mindset_cols.includes(row.item))
    .reduce((sum, row) => sum + (row.contribution || 0), 0);
  const mindsetMoney = Math.round(baseline * mindsetPct);
  const transactionMoney = Math.round(totalGain - mindsetMoney);
  const parts = [
    { route: "Mindset Route", contribution: mindsetMoney },
    { route: "Transaction Route", contribution: transactionMoney },
  ];

  Plotly.newPlot(
    "scenario-plot",
    [
      {
        x: parts.map((row) => row.contribution),
        y: parts.map((row) => row.route),
        type: "bar",
        orientation: "h",
        text: parts.map((row) => `$${formatNumber(Math.abs(row.contribution), 0)}`),
        textposition: "auto",
        marker: {
          color: parts.map((row) => (row.contribution >= 0 ? COLORS.blue : COLORS.pink)),
        },
      },
    ],
    theme({
      title: { text: "Revenue Gain Decomposition ($)" },
      xaxis: { title: "Contribution to Revenue ($)", zeroline: true, zerolinecolor: "#333" },
      yaxis: { title: "" },
      margin: { t: 40, r: 20, b: 50, l: 140 },
    }),
    PLOT_CONFIG
  );

  const display = rows.map((row) => ({
    item: row.item,
    baseline: row.baseline,
    new_value: row.new_value,
    short_run_gain: row.short_run_gain * 100,
    long_run_gain: row.long_run_gain * 100,
    contribution: row.contribution === null ? null : row.contribution * 100,
  }));
  document.getElementById("scenario-table").innerHTML = table(
    [
      { key: "item", label: "Item" },
      { key: "baseline", label: "Baseline", digits: 2 },
      { key: "new_value", label: "New value", digits: 2 },
      { key: "short_run_gain", label: "Short-run gain %", digits: 0 },
      { key: "long_run_gain", label: "Long-run gain %", digits: 0 },
      { key: "contribution", label: "Contribution %", digits: 0 },
    ],
    display
  );
}

function setupSimulator(data) {
  const sim = data.simulator;
  const spending = {};
  const holder = document.getElementById("sliders");
  holder.innerHTML = "";
  Object.keys(sim.baseline_spending).forEach((channel) => {
    const baseline = sim.baseline_spending[channel];
    const start = Math.round(baseline);
    const max = Math.round(baseline * 3);
    spending[channel] = start;
    const wrap = document.createElement("div");
    wrap.className = "slider";
    wrap.innerHTML = `<label><span>${channel}</span><span data-readout>${start} units</span></label>`;
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = String(max);
    input.step = "1";
    input.value = String(start);
    input.addEventListener("input", () => {
      spending[channel] = Number(input.value);
      wrap.querySelector("[data-readout]").textContent = `${input.value} units`;
    });
    wrap.appendChild(input);
    holder.appendChild(wrap);
  });
  document.getElementById("run-scenario").addEventListener("click", () => {
    renderScenario(sim, spending);
  });
  renderScenario(sim, spending);
}

function showTab(name, data, drawn) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.id === name);
  });
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === name);
  });
  if (!drawn[name]) {
    drawn[name] = true;
    if (name === "overview") renderOverview(data);
    if (name === "funnel") renderFunnel(data);
    if (name === "effects") renderEffects(data);
    if (name === "efficiency") renderEfficiency(data);
    if (name === "simulator") setupSimulator(data);
  }
  requestAnimationFrame(() => {
    document.querySelectorAll(`#${name} .js-plotly-plot`).forEach((el) => {
      Plotly.Plots.resize(el);
    });
  });
}

function boot() {
  const data = window.RESULTS;
  if (!data) {
    document.querySelector("main").textContent =
      "Analysis results were not found. Run python analysis.py and reload this page.";
    return;
  }
  const drawn = {};
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.tab, data, drawn));
  });
  showTab("overview", data, drawn);
}

boot();
