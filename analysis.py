"""Reproduce the mindset analysis and export the dashboard payload.

The calculations follow the original R notebook and the Shiny simulator in
app.R. Liking and Consideration can be negative, so log(y + 1) drops those
rows the same way R's lm() does.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pyreadr
from statsmodels.regression.linear_model import OLS
from statsmodels.tsa.seasonal import STL

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "MindSet Data.RData"
DOCS = ROOT / "docs"

SALES_COL = "Sales"
MINDSET_COLS = ["Awareness", "Liking", "Consideration"]
MARKETING_COLS = [
    "InstagramAds",
    "TikTokAds",
    "SEA",
    "PoSPromotions",
    "InfluencerColabs",
]
MAX_WEEKS = 4


def load_mindset() -> pd.DataFrame:
    loaded = pyreadr.read_r(str(DATA_PATH))
    if "MindSetDF" not in loaded:
        raise KeyError(
            f"MindSet Data.RData does not contain MindSetDF. Found: {list(loaded)}"
        )
    frame = loaded["MindSetDF"].copy()
    expected = [SALES_COL, *MINDSET_COLS, *MARKETING_COLS]
    missing = [col for col in expected if col not in frame.columns]
    if missing:
        raise KeyError(f"Missing columns: {missing}")
    return frame[expected].apply(pd.to_numeric, errors="coerce").reset_index(drop=True)


def yule_walker_aic(series: np.ndarray) -> tuple[int, np.ndarray]:
    """Yule-Walker AR order selection, matching R's ar(..., method = 'yule-walker')."""
    values = np.asarray(series, dtype=float)
    values = values[np.isfinite(values)]
    values = values - values.mean()
    n = len(values)
    order_max = min(n - 1, int(np.floor(10 * np.log10(n))))
    if order_max < 1:
        return 0, np.array([])

    gamma = np.empty(order_max + 1)
    for lag in range(order_max + 1):
        gamma[lag] = np.dot(values[lag:], values[: n - lag]) / n

    variances = np.empty(order_max + 1)
    variances[0] = gamma[0]
    phis: list[np.ndarray] = []
    previous = np.array([])
    for order in range(1, order_max + 1):
        if order == 1:
            reflection = gamma[1] / gamma[0]
            phi = np.array([reflection])
        else:
            reflection = (
                gamma[order] - np.dot(previous, gamma[1:order][::-1])
            ) / variances[order - 1]
            phi = np.empty(order)
            phi[: order - 1] = previous - reflection * previous[::-1]
            phi[order - 1] = reflection
        variances[order] = variances[order - 1] * (1.0 - reflection**2)
        if variances[order] <= 0:
            variances[order:] = np.nan
            break
        previous = phi
        phis.append(phi.copy())

    usable = np.isfinite(variances) & (variances > 0)
    aic = np.full_like(variances, np.inf)
    aic[usable] = n * np.log(variances[usable]) + 2 * np.arange(order_max + 1)[usable] + 2
    order = int(np.argmin(aic))
    if order == 0:
        return 0, np.array([])
    return order, phis[order - 1]


def fit_log_linear(frame: pd.DataFrame, y_col: str, regressors: list[str]):
    """OLS of log(y + 1) on log(x + 1). Incomplete rows are dropped, as in R lm()."""
    design = pd.DataFrame(
        {name: np.log(frame[name].astype(float) + 1.0) for name in regressors}
    )
    design.insert(0, "const", 1.0)
    outcome = np.log(frame[y_col].astype(float) + 1.0)
    model_frame = pd.concat([outcome.rename("__y"), design], axis=1)
    model_frame = model_frame.replace([np.inf, -np.inf], np.nan).dropna()
    return OLS(model_frame["__y"], model_frame.drop(columns="__y")).fit()


def coef_map(model) -> dict[str, float]:
    return {name: float(value) for name, value in model.params.items()}


def channel_elasticities(coefficients: dict[str, float]) -> dict[str, float]:
    return {
        channel: coefficients[channel]
        for channel in MARKETING_COLS
        if channel in coefficients
    }


def native(value):
    if isinstance(value, dict):
        return {str(key): native(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [native(item) for item in value]
    if isinstance(value, np.ndarray):
        return native(value.tolist())
    if isinstance(value, (np.floating, float)):
        number = float(value)
        if not np.isfinite(number):
            return None
        return number
    if isinstance(value, (np.integer, int)):
        return int(value)
    return value


def analyze(frame: pd.DataFrame) -> dict:
    sales = frame[SALES_COL].to_numpy(dtype=float)
    stl = STL(sales, period=7, robust=True).fit()
    trend = np.asarray(stl.trend, dtype=float)
    seasonal = np.asarray(stl.seasonal, dtype=float)
    week = np.arange(len(trend)) // 7 + 1
    weekly_trend = (
        pd.DataFrame({"week": week, "trend": trend})
        .groupby("week", as_index=False)["trend"]
        .mean()
    )
    seasonality = (
        pd.DataFrame(
            {
                "day": np.resize(np.arange(1, 8), len(seasonal)),
                "seasonal": seasonal,
            }
        )
        .groupby("day", as_index=False)["seasonal"]
        .mean()
    )

    potential_rows = []
    for metric in MINDSET_COLS:
        mean_val = float(frame[metric].mean())
        max_val = float(frame[metric].max())
        potential_rows.append(
            {"metric": metric, "potential": 1.0 - (mean_val / max_val)}
        )
    potential = pd.DataFrame(potential_rows)

    stickiness_source = {
        "Awareness": frame["Awareness"].to_numpy(dtype=float),
        "Liking": ((frame["Liking"] + 100) / 2).to_numpy(dtype=float),
        "Consideration": ((frame["Consideration"] + 100) / 2).to_numpy(dtype=float),
    }
    stickiness_rows = []
    for metric, series in stickiness_source.items():
        order, coefficients = yule_walker_aic(series)
        stickiness_rows.append(
            {
                "metric": metric,
                "ar_order": order,
                "stickiness": float(coefficients.sum()) if len(coefficients) else 0.0,
            }
        )
    stickiness = pd.DataFrame(stickiness_rows)

    lagged = frame.copy()
    for column in [SALES_COL, *MINDSET_COLS]:
        lagged[f"lag_{column}"] = lagged[column].shift(1).fillna(0.0)

    responsiveness = {}
    for metric in [*MINDSET_COLS, SALES_COL]:
        model = fit_log_linear(
            lagged,
            metric,
            [f"lag_{metric}", *MARKETING_COLS],
        )
        named = coef_map(model)
        renamed = {}
        for key, value in named.items():
            if key == f"lag_{metric}":
                renamed["lag"] = value
            else:
                renamed[key] = value
        responsiveness[metric] = renamed

    conversion_model = fit_log_linear(
        lagged,
        SALES_COL,
        [f"lag_{SALES_COL}", *MINDSET_COLS],
    )
    conversion_coefs = coef_map(conversion_model)
    conversion_table = [
        {"mindset_metric": metric, "conversion_coefficient": conversion_coefs[metric]}
        for metric in MINDSET_COLS
        if metric in conversion_coefs
    ]
    conversion_lookup = {
        row["mindset_metric"]: row["conversion_coefficient"] for row in conversion_table
    }

    criteria = potential.merge(stickiness, on="metric").merge(
        pd.DataFrame(conversion_table).rename(columns={"mindset_metric": "metric"}),
        on="metric",
        how="left",
    )

    appeal_rows = []
    for channel in MARKETING_COLS:
        for metric in MINDSET_COLS:
            pot = float(potential.loc[potential["metric"] == metric, "potential"].iloc[0])
            sticky = float(
                stickiness.loc[stickiness["metric"] == metric, "stickiness"].iloc[0]
            )
            response = responsiveness[metric].get(channel, np.nan)
            convert = conversion_lookup.get(metric, np.nan)
            long_run = 1.0 / (1.0 - sticky) if sticky != 1 else np.nan
            appeal_rows.append(
                {
                    "marketing_channel": channel,
                    "mindset_metric": metric,
                    "appeal": float(pot * response * long_run * convert),
                }
            )
    appeal = pd.DataFrame(appeal_rows)
    total_appeal = (
        appeal.groupby("marketing_channel", as_index=False)["appeal"]
        .sum()
        .rename(columns={"appeal": "total_appeal"})
        .sort_values("total_appeal", ascending=False)
    )

    sales_elasticities = channel_elasticities(responsiveness[SALES_COL])
    indirect_totals = {}
    for channel in MARKETING_COLS:
        indirect = 0.0
        for metric in MINDSET_COLS:
            marketing_to_mindset = responsiveness[metric].get(channel)
            mindset_to_sales = conversion_lookup.get(metric)
            if marketing_to_mindset is None or mindset_to_sales is None:
                continue
            indirect += marketing_to_mindset * mindset_to_sales
        indirect_totals[channel] = indirect

    effects = []
    for channel in MARKETING_COLS:
        direct = float(sales_elasticities.get(channel, 0.0))
        indirect = float(indirect_totals[channel])
        total = direct + indirect
        effects.append(
            {
                "marketing_variable": channel,
                "direct_effect": direct,
                "indirect_effect": indirect,
                "total_effect": total,
                "indirect_percentage": (indirect / total * 100.0) if total != 0 else 0.0,
            }
        )

    lag_frame = frame.copy()
    lag_frame["lag_sales"] = lag_frame[SALES_COL].shift(1).fillna(0.0)
    lag_regressors = ["lag_sales"]
    for channel in MARKETING_COLS:
        lag_frame[channel] = lag_frame[channel]
        lag_regressors.append(channel)
        for week in range(1, MAX_WEEKS + 1):
            name = f"{channel}_lag_week{week}"
            lag_frame[name] = lag_frame[channel].shift(week * 7)
            lag_regressors.append(name)
    lag_model = fit_log_linear(lag_frame, SALES_COL, lag_regressors)
    lag_rows = []
    for name, value in coef_map(lag_model).items():
        if name in {"const", "lag_sales"}:
            continue
        if "_lag_week" in name:
            variable, _, week_label = name.partition("_lag_week")
            lag_period = int(week_label)
        else:
            variable = name
            lag_period = 0
        lag_rows.append(
            {
                "variable": variable,
                "lag_period": lag_period,
                "coefficient": value,
            }
        )
    lag_results = pd.DataFrame(lag_rows).sort_values(["variable", "lag_period"])

    lead_rows = []
    for metric in MINDSET_COLS:
        current = frame[metric]
        for week in range(0, MAX_WEEKS + 1):
            future_sales = frame[SALES_COL].shift(-week * 7)
            correlation = float(current.corr(future_sales))
            lead_rows.append(
                {
                    "mindset_metric": metric,
                    "lag_period_weeks": week,
                    "correlation": correlation,
                }
            )
    lead = pd.DataFrame(lead_rows)
    predictor_rows = []
    for metric, group in lead.groupby("mindset_metric"):
        idx = group["correlation"].abs().idxmax()
        row = group.loc[idx]
        predictor_rows.append(
            {
                "mindset_metric": metric,
                "max_correlation": float(abs(row["correlation"])),
                "optimal_lag_weeks": int(row["lag_period_weeks"]),
                "signed_correlation": float(row["correlation"]),
            }
        )
    best_predictors = (
        pd.DataFrame(predictor_rows)
        .sort_values("max_correlation", ascending=False)
        .reset_index(drop=True)
    )

    funnel_means = [
        {"stage": metric, "mean": float(frame[metric].mean())} for metric in MINDSET_COLS
    ]
    max_mean = max(row["mean"] for row in funnel_means)
    funnel = [
        {"stage": row["stage"], "value": row["mean"] / max_mean} for row in funnel_means
    ]

    elasticity = []
    for metric in [*MINDSET_COLS, SALES_COL]:
        for channel, value in channel_elasticities(responsiveness[metric]).items():
            elasticity.append(
                {"metric": metric, "channel": channel, "elasticity": value}
            )

    baseline_spending = {
        channel: float(frame[channel].mean()) for channel in MARKETING_COLS
    }

    def scaled_baseline(column: str, is_mindset: bool) -> float:
        level = float(frame[column].mean())
        if not is_mindset:
            return level
        max_val = float(frame[column].max())
        if max_val > 10:
            return level / 100.0
        if max_val > 1:
            return level / max_val
        return level

    simulator_models = {}
    for metric in [*MINDSET_COLS, SALES_COL]:
        is_mindset = metric in MINDSET_COLS
        coefficients = responsiveness[metric]
        carryover = float(coefficients.get("lag", 0.0))
        simulator_models[metric] = {
            "is_mindset": is_mindset,
            "baseline": scaled_baseline(metric, is_mindset),
            "carryover": carryover,
            "elasticities": channel_elasticities(coefficients),
        }

    numeric = frame.select_dtypes(include="number")
    correlation = numeric.corr().round(6)

    return {
        "meta": {
            "n_days": int(len(frame)),
            "sales_col": SALES_COL,
            "mindset_cols": MINDSET_COLS,
            "marketing_cols": MARKETING_COLS,
            "note": (
                "log(y + 1) models drop rows where y + 1 is not positive, "
                "matching R lm() on Liking and Consideration."
            ),
        },
        "series": {
            "time": list(range(1, len(frame) + 1)),
            "sales": frame[SALES_COL].astype(float).tolist(),
        },
        "stl": {
            "weekly_trend": weekly_trend.to_dict(orient="records"),
            "seasonality": seasonality.to_dict(orient="records"),
        },
        "correlation": {
            "columns": list(correlation.columns),
            "matrix": correlation.to_numpy().tolist(),
        },
        "kpis": {
            "avg_sales": float(frame[SALES_COL].mean()),
            "best_predictors": best_predictors.to_dict(orient="records"),
            "top_kpis": best_predictors.head(2).to_dict(orient="records"),
        },
        "criteria": criteria.to_dict(orient="records"),
        "funnel": funnel,
        "conversion": conversion_table,
        "elasticity": elasticity,
        "effects": effects,
        "appeal": appeal.to_dict(orient="records"),
        "total_appeal": total_appeal.to_dict(orient="records"),
        "lag_results": lag_results.to_dict(orient="records"),
        "simulator": {
            "baseline_spending": baseline_spending,
            "models": simulator_models,
            "conversion": conversion_lookup,
            "mindset_cols": MINDSET_COLS,
            "sales_col": SALES_COL,
        },
    }


def main() -> None:
    frame = load_mindset()
    payload = native(analyze(frame))
    DOCS.mkdir(exist_ok=True)
    text = json.dumps(payload, indent=2)
    (DOCS / "results.json").write_text(text, encoding="utf-8")
    (DOCS / "results.js").write_text(
        "window.RESULTS = " + text + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {DOCS / 'results.json'}")
    print(f"Average sales: {payload['kpis']['avg_sales']:.1f}")
    print("Top KPIs:")
    for row in payload["kpis"]["top_kpis"]:
        print(
            f"  {row['mindset_metric']}: {row['max_correlation']:.3f} "
            f"at week {row['optimal_lag_weeks']}"
        )


if __name__ == "__main__":
    main()
