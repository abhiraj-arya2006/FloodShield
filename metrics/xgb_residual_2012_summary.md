# XGBoost residual correction: 2012 holdout

Ensemble `ens_perlead_hf5`; fit on 186510 observed rows (2009-2011), 64441 observed rows in 2012. Best round 393 of 400.

| Lead | NSE before | NSE after | Floods caught before | after | False-alarm share before | after | Peak ratio before | after | Gauges better / worse |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 0.538 | 0.618 | 677/905 | 576/905 | 0.402 | 0.284 | 0.797 | 0.645 | 25 / 21 |
| 3 | 0.545 | 0.620 | 683/905 | 585/905 | 0.406 | 0.289 | 0.789 | 0.657 | 25 / 21 |
| 4 | 0.564 | 0.626 | 668/905 | 572/905 | 0.403 | 0.271 | 0.766 | 0.641 | 25 / 21 |

Standardised log-flow RMSE on 2012: 0.5061 before, 0.4154 after.

2012 chose the stopping round and also gives these scores, so they are not fully independent. The same years also selected the ensemble. Future rain is observed IMD rain, not a real forecast.
## Verdict

Mixed, and not a clear improvement for flood warning. Everyday flow error and false alarms fall, but about 100 fewer flood days are caught at each lead and peaks are further under-predicted.

At lead 2 the ensemble under-forecasts flood days (mean residual +0.119) and the correction pushes them lower still (mean predicted residual -0.120). On other days it moves in the right direction (-0.161 actual, -0.134 predicted).
