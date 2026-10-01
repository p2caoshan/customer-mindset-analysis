# Customer Mindset Analysis

Python port of a marketing-mix study. The analysis separates immediate sales impact from longer-term brand effects that travel through customer mindset (Awareness, Liking, and Consideration).

The public dashboard is a static site in `docs/`. The original R notebook, Shiny app, written report, and walkthrough video can stay in this folder for local reference. They are listed in `.gitignore` and are not part of the published repository.

## Public dashboard

Open the live site:

https://p2caoshan.github.io/customer-mindset-analysis/

GitHub Pages serves the same pages from `docs/` on `main`. The five tabs match the original Shiny app:

- Executive Summary
- Marketing Funnel
- Direct vs. Indirect
- Channel Efficiency
- Budget Simulator

The simulator runs in the browser. Move a channel slider and choose **Run simulation** to recompute sales and mindset impact from the exported elasticities.

To preview locally after a fresh analysis:

```bash
python -m http.server 8765 --directory docs
```

Then open `http://127.0.0.1:8765/`.

## Rerun the analysis

Requires Python 3.12 or newer.

```bash
pip install -r requirements.txt
python analysis.py
```

`analysis.py` reads `MindSet Data.RData` (object `MindSetDF`) and writes `docs/results.json` and `docs/results.js`. Reload the site after that.

## Data

`MindSetDF` has 1,100 daily rows and nine columns:

| Column | Role |
| --- | --- |
| Sales | Outcome |
| Awareness, Liking, Consideration | Mindset stages |
| InstagramAds, TikTokAds, SEA, PoSPromotions, InfluencerColabs | Marketing spend |

## Method

The script follows the original R notebook and the scenario math in `app.R`.

- Potential for a mindset metric is `1 - mean / max`.
- Stickiness is the sum of Yule-Walker autoregressive coefficients. Liking and Consideration are transformed as `(x + 100) / 2` before that model, as in the notebook.
- Responsiveness and conversion are log-linear regressions of `log(y + 1)` on lagged `log(y + 1)` and the relevant drivers.
- Appeal is `potential × short-run responsiveness × 1 / (1 - stickiness) × conversion`.
- The direct effect is the sales elasticity of a channel. The indirect effect sums, across mindset stages, the channel-to-mindset elasticity times the mindset-to-sales conversion.

Liking and Consideration take negative values. `log(y + 1)` drops those rows, which is the same row filter R `lm()` uses.

## Local-only files

These stay on disk and are excluded from git:

- `Mindset_Analysis.Rmd` — full R analysis
- `app.R` — original Shiny dashboard
- `Project-Report.pdf` — written report
- `Mindset-Walkthrough.mp4` — walkthrough
