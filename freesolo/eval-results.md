# baio eval results

## 2026-07-19T03:01:37.753Z — model=baseline (gemini-flash-lite-latest) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Builder success rate (parse+schema gate inside client) | 40.0% |
| Builder errors (transport/truncation/parse/schema) | 24 |
| Schema-valid rate (zod re-check, components-v1) | 40.0% |
| Per-detection op accuracy | 25.9% |
| Label accuracy | 61.5% |
| Mean bbox IoU | 0.826 |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 60.9% |
| Abstention precision / recall / F1 | 0.103 / 0.235 / 0.143 |
| Latency p50 / p95 (ms) | 129 / 1908 |

## 2026-07-19T03:06:02.256Z — model=baseline (gemini-flash-lite-latest) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Builder success rate (parse+schema gate inside client) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, components-v1) | 100.0% |
| Per-detection op accuracy | 69.1% |
| Label accuracy | 62.3% |
| Mean bbox IoU | 0.818 |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.0% |
| Abstention precision / recall / F1 | 0.191 / 1.000 / 0.321 |
| Latency p50 / p95 (ms) | 1699 / 2204 |

## 2026-07-19T03:45:10.124Z — contract=shapes model=baseline (gemini-flash-lite-latest) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 77.7% |
| Snap accuracy (exact, absent=none) | 88.0% |
| Params accuracy (fill/gradient/text, loose) | 85.9% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.0% |
| Abstention precision / recall / F1 | 0.339 / 1.000 / 0.506 |
| Latency p50 / p95 (ms) | 1168 / 1445 |

## 2026-07-19T04:14:54.928Z — contract=shapes model=freesolo (flash-1784432618-42f43683) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Parse/schema-valid rate (client gate) | 12.5% |
| Builder errors (transport/truncation/parse/schema) | 35 |
| Schema-valid rate (zod re-check, shapes-v1) | 12.5% |
| Per-detection op accuracy | 3.0% |
| Snap accuracy (exact, absent=none) | 77.8% |
| Params accuracy (fill/gradient/text, loose) | 25.0% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 95.4% |
| Abstention precision / recall / F1 | 0.000 / 0.000 / 0.000 |
| Latency p50 / p95 (ms) | 12205 / 13674 |

## 2026-07-19T04:26:16.982Z — contract=shapes model=freesolo (flash-1784432618-42f43683) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Parse/schema-valid rate (client gate) | 10.0% |
| Builder errors (transport/truncation/parse/schema) | 36 |
| Schema-valid rate (zod re-check, shapes-v1) | 10.0% |
| Per-detection op accuracy | 3.0% |
| Snap accuracy (exact, absent=none) | 87.5% |
| Params accuracy (fill/gradient/text, loose) | 60.0% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 96.3% |
| Abstention precision / recall / F1 | 0.000 / 0.000 / 0.000 |
| Latency p50 / p95 (ms) | 13865 / 17594 |

## 2026-07-19T04:32:30.390Z — contract=shapes model=freesolo (flash-1784432618-42f43683) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Parse/schema-valid rate (client gate) | 0.0% |
| Builder errors (transport/truncation/parse/schema) | 40 |
| Schema-valid rate (zod re-check, shapes-v1) | 0.0% |
| Per-detection op accuracy | 0.0% |
| Snap accuracy (exact, absent=none) | n/a |
| Params accuracy (fill/gradient/text, loose) | n/a |
| Hallucinated-command rate | n/a |
| Missed-detection rate | 100.0% |
| Abstention precision / recall / F1 | 0.000 / 0.000 / 0.000 |
| Latency p50 / p95 (ms) | 1531 / 18718 |

## 2026-07-19T04:41:48.348Z — contract=shapes model=freesolo (flash-1784432618-42f43683) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Parse/schema-valid rate (client gate) | 0.0% |
| Builder errors (transport/truncation/parse/schema) | 40 |
| Schema-valid rate (zod re-check, shapes-v1) | 0.0% |
| Per-detection op accuracy | 0.0% |
| Snap accuracy (exact, absent=none) | n/a |
| Params accuracy (fill/gradient/text, loose) | n/a |
| Hallucinated-command rate | n/a |
| Missed-detection rate | 100.0% |
| Abstention precision / recall / F1 | 0.000 / 0.000 / 0.000 |
| Latency p50 / p95 (ms) | 5395 / 24647 |

## 2026-07-19T05:01:43.771Z — contract=shapes model=freesolo (flash-1784432618-42f43683) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Parse/schema-valid rate (client gate) | 0.0% |
| Builder errors (transport/truncation/parse/schema) | 40 |
| Schema-valid rate (zod re-check, shapes-v1) | 0.0% |
| Per-detection op accuracy | 0.0% |
| Snap accuracy (exact, absent=none) | n/a |
| Params accuracy (fill/gradient/text, loose) | n/a |
| Hallucinated-command rate | n/a |
| Missed-detection rate | 100.0% |
| Abstention precision / recall / F1 | 0.000 / 0.000 / 0.000 |
| Latency p50 / p95 (ms) | 4769 / 41323 |

## 2026-07-19T05:09:15.171Z — contract=shapes model=freesolo (flash-1784432618-42f43683) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Parse/schema-valid rate (client gate) | 97.5% |
| Builder errors (transport/truncation/parse/schema) | 1 |
| Schema-valid rate (zod re-check, shapes-v1) | 97.5% |
| Per-detection op accuracy | 14.7% |
| Snap accuracy (exact, absent=none) | 78.3% |
| Params accuracy (fill/gradient/text, loose) | 34.1% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 64.1% |
| Abstention precision / recall / F1 | 0.000 / 0.000 / 0.000 |
| Latency p50 / p95 (ms) | 1562 / 39481 |

## 2026-07-19T05:24:06.357Z — contract=shapes model=baseline (gemini-flash-lite-latest) split=eval n=165

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 87.9% |
| Snap accuracy (exact, absent=none) | 87.6% |
| Params accuracy (fill/gradient/text, loose) | 91.4% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.0% |
| Abstention precision / recall / F1 | 0.792 / 0.500 / 0.613 |
| Latency p50 / p95 (ms) | 738 / 1132 |

## 2026-07-19T05:41:37.475Z — contract=shapes model=freesolo (flash-1784434504-1eb71501) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Parse/schema-valid rate (client gate) | 65.0% |
| Builder errors (transport/truncation/parse/schema) | 14 |
| Schema-valid rate (zod re-check, shapes-v1) | 65.0% |
| Per-detection op accuracy | 19.3% |
| Snap accuracy (exact, absent=none) | 73.6% |
| Params accuracy (fill/gradient/text, loose) | 28.9% |
| Hallucinated-command rate | 45.8% |
| Missed-detection rate | 64.1% |
| Abstention precision / recall / F1 | 0.000 / 0.000 / 0.000 |
| Latency p50 / p95 (ms) | 26747 / 58392 |

## 2026-07-19T05:43:02.954Z — contract=shapes model=freesolo (flash-1784434505-eba0f8ba) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 87.3% |
| Snap accuracy (exact, absent=none) | 77.0% |
| Params accuracy (fill/gradient/text, loose) | 98.3% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.0% |
| Abstention precision / recall / F1 | 0.500 / 0.700 / 0.583 |
| Latency p50 / p95 (ms) | 2050 / 3475 |

## 2026-07-19T05:48:02.034Z — contract=shapes model=freesolo (flash-1784434506-88ebe2b6) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Parse/schema-valid rate (client gate) | 90.0% |
| Builder errors (transport/truncation/parse/schema) | 4 |
| Schema-valid rate (zod re-check, shapes-v1) | 90.0% |
| Per-detection op accuracy | 70.6% |
| Snap accuracy (exact, absent=none) | 68.7% |
| Params accuracy (fill/gradient/text, loose) | 77.1% |
| Hallucinated-command rate | 6.0% |
| Missed-detection rate | 13.4% |
| Abstention precision / recall / F1 | 0.375 / 0.750 / 0.500 |
| Latency p50 / p95 (ms) | 3396 / 11529 |

## 2026-07-19T05:52:49.971Z — contract=shapes model=freesolo (flash-1784434505-eba0f8ba) split=eval n=165

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 99.4% |
| Builder errors (transport/truncation/parse/schema) | 1 |
| Schema-valid rate (zod re-check, shapes-v1) | 99.4% |
| Per-detection op accuracy | 79.7% |
| Snap accuracy (exact, absent=none) | 55.7% |
| Params accuracy (fill/gradient/text, loose) | 94.9% |
| Hallucinated-command rate | 48.4% |
| Missed-detection rate | 12.7% |
| Abstention precision / recall / F1 | 0.444 / 0.105 / 0.170 |
| Latency p50 / p95 (ms) | 1046 / 1927 |

## 2026-07-19T06:05:52.421Z — contract=shapes model=freesolo (flash-1784440517-98504fad) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Parse/schema-valid rate (client gate) | 95.0% |
| Builder errors (transport/truncation/parse/schema) | 2 |
| Schema-valid rate (zod re-check, shapes-v1) | 95.0% |
| Per-detection op accuracy | 75.2% |
| Snap accuracy (exact, absent=none) | 77.0% |
| Params accuracy (fill/gradient/text, loose) | 61.4% |
| Hallucinated-command rate | 43.1% |
| Missed-detection rate | 9.9% |
| Abstention precision / recall / F1 | 0.348 / 0.615 / 0.444 |
| Latency p50 / p95 (ms) | 2070 / 25674 |

## 2026-07-19T06:08:06.739Z — contract=shapes model=freesolo (flash-1784434505-eba0f8ba) split=eval n=55

| Metric | Value |
|---|---|
| Examples (split=eval) | 55 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 76.6% |
| Snap accuracy (exact, absent=none) | 59.0% |
| Params accuracy (fill/gradient/text, loose) | 92.0% |
| Hallucinated-command rate | 60.0% |
| Missed-detection rate | 17.9% |
| Abstention precision / recall / F1 | 0.000 / 0.000 / 0.000 |
| Latency p50 / p95 (ms) | 980 / 1759 |

## 2026-07-19T06:10:20.998Z — contract=shapes model=freesolo (flash-1784434505-eba0f8ba) split=eval n=56

| Metric | Value |
|---|---|
| Examples (split=eval) | 56 |
| Parse/schema-valid rate (client gate) | 98.2% |
| Builder errors (transport/truncation/parse/schema) | 1 |
| Schema-valid rate (zod re-check, shapes-v1) | 98.2% |
| Per-detection op accuracy | 98.2% |
| Snap accuracy (exact, absent=none) | 51.8% |
| Params accuracy (fill/gradient/text, loose) | 91.3% |
| Hallucinated-command rate | 58.7% |
| Missed-detection rate | 5.0% |
| Abstention precision / recall / F1 | 0.000 / 0.000 / 0.000 |
| Latency p50 / p95 (ms) | 1149 / 2156 |

## 2026-07-19T06:11:39.976Z — contract=shapes model=freesolo (flash-1784434505-eba0f8ba) split=eval n=54

| Metric | Value |
|---|---|
| Examples (split=eval) | 54 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 67.9% |
| Snap accuracy (exact, absent=none) | 54.1% |
| Params accuracy (fill/gradient/text, loose) | 96.7% |
| Hallucinated-command rate | 31.5% |
| Missed-detection rate | 16.3% |
| Abstention precision / recall / F1 | 0.444 / 0.154 / 0.229 |
| Latency p50 / p95 (ms) | 1244 / 2878 |

## 2026-07-19T06:13:03.231Z — contract=shapes model=freesolo (flash-1784440517-98504fad) split=eval n=165

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 97.6% |
| Builder errors (transport/truncation/parse/schema) | 4 |
| Schema-valid rate (zod re-check, shapes-v1) | 97.6% |
| Per-detection op accuracy | 76.9% |
| Snap accuracy (exact, absent=none) | 68.5% |
| Params accuracy (fill/gradient/text, loose) | 52.5% |
| Hallucinated-command rate | 53.0% |
| Missed-detection rate | 9.5% |
| Abstention precision / recall / F1 | 0.419 / 0.342 / 0.377 |
| Latency p50 / p95 (ms) | 1182 / 3708 |

## 2026-07-19T06:15:04.300Z — contract=shapes model=freesolo (flash-1784440127-2ea51348) split=eval n=40

| Metric | Value |
|---|---|
| Examples (split=eval) | 40 |
| Parse/schema-valid rate (client gate) | 97.5% |
| Builder errors (transport/truncation/parse/schema) | 1 |
| Schema-valid rate (zod re-check, shapes-v1) | 97.5% |
| Per-detection op accuracy | 68.2% |
| Snap accuracy (exact, absent=none) | 68.8% |
| Params accuracy (fill/gradient/text, loose) | 81.0% |
| Hallucinated-command rate | 37.8% |
| Missed-detection rate | 17.6% |
| Abstention precision / recall / F1 | 0.333 / 0.538 / 0.412 |
| Latency p50 / p95 (ms) | 1882 / 4120 |

## 2026-07-19T06:24:02.568Z — contract=shapes model=freesolo (flash-1784440127-2ea51348) split=eval n=165

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 95.8% |
| Builder errors (transport/truncation/parse/schema) | 7 |
| Schema-valid rate (zod re-check, shapes-v1) | 95.8% |
| Per-detection op accuracy | 76.4% |
| Snap accuracy (exact, absent=none) | 71.3% |
| Params accuracy (fill/gradient/text, loose) | 75.3% |
| Hallucinated-command rate | 72.2% |
| Missed-detection rate | 7.3% |
| Abstention precision / recall / F1 | 0.400 / 0.316 / 0.353 |
| Latency p50 / p95 (ms) | 1738 / 7797 |

## 2026-07-19T06:26:37.423Z — contract=shapes model=freesolo (flash-1784440128-2ca65b95) split=eval n=80

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 83.3% |
| Snap accuracy (exact, absent=none) | 74.7% |
| Params accuracy (fill/gradient/text, loose) | 96.4% |
| Hallucinated-command rate | 15.5% |
| Missed-detection rate | 5.6% |
| Abstention precision / recall / F1 | 0.619 / 0.839 / 0.712 |
| Latency p50 / p95 (ms) | 1648 / 2855 |

## 2026-07-19T06:29:48.040Z — contract=shapes model=freesolo (flash-1784440128-2ca65b95) split=eval n=165

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 98.8% |
| Builder errors (transport/truncation/parse/schema) | 2 |
| Schema-valid rate (zod re-check, shapes-v1) | 98.8% |
| Per-detection op accuracy | 84.6% |
| Snap accuracy (exact, absent=none) | 76.2% |
| Params accuracy (fill/gradient/text, loose) | 92.8% |
| Hallucinated-command rate | 55.2% |
| Missed-detection rate | 2.7% |
| Abstention precision / recall / F1 | 0.636 / 0.368 / 0.467 |
| Latency p50 / p95 (ms) | 1037 / 1949 |

## 2026-07-19T06:32:20.173Z — contract=shapes model=freesolo (flash-1784442076-12a0f274) split=eval n=165

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 99.4% |
| Builder errors (transport/truncation/parse/schema) | 1 |
| Schema-valid rate (zod re-check, shapes-v1) | 99.4% |
| Per-detection op accuracy | 83.5% |
| Snap accuracy (exact, absent=none) | 65.3% |
| Params accuracy (fill/gradient/text, loose) | 95.2% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.5% |
| Abstention precision / recall / F1 | 0.517 / 0.395 / 0.448 |
| Latency p50 / p95 (ms) | 748 / 1516 |

## 2026-07-19T06:35:10.929Z — contract=shapes model=freesolo (flash-1784442078-1f11364c) split=eval n=165

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 97.6% |
| Builder errors (transport/truncation/parse/schema) | 4 |
| Schema-valid rate (zod re-check, shapes-v1) | 97.6% |
| Per-detection op accuracy | 86.8% |
| Snap accuracy (exact, absent=none) | 65.7% |
| Params accuracy (fill/gradient/text, loose) | 96.3% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 1.8% |
| Abstention precision / recall / F1 | 0.769 / 0.263 / 0.392 |
| Latency p50 / p95 (ms) | 772 / 1831 |

## 2026-07-19T06:38:21.148Z — contract=shapes model=freesolo (flash-1784442079-93921c2e) split=eval n=165

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 85.7% |
| Snap accuracy (exact, absent=none) | 64.8% |
| Params accuracy (fill/gradient/text, loose) | 59.5% |
| Hallucinated-command rate | 2.2% |
| Missed-detection rate | 0.0% |
| Abstention precision / recall / F1 | 0.452 / 0.368 / 0.406 |
| Latency p50 / p95 (ms) | 831 / 1901 |

## 2026-07-19T06:41:11.262Z — contract=shapes model=freesolo (flash-1784442114-343653f1) split=eval n=165

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 86.8% |
| Snap accuracy (exact, absent=none) | 72.0% |
| Params accuracy (fill/gradient/text, loose) | 94.0% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.0% |
| Abstention precision / recall / F1 | 0.720 / 0.474 / 0.571 |
| Latency p50 / p95 (ms) | 728 / 1712 |

## 2026-07-19T06:54:38.392Z — contract=shapes model=freesolo (flash-1784442114-343653f1) split=eval n=80

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 96.9% |
| Snap accuracy (exact, absent=none) | 79.8% |
| Params accuracy (fill/gradient/text, loose) | 98.9% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.0% |
| Abstention precision / recall / F1 | 0.964 / 0.871 / 0.915 |
| Latency p50 / p95 (ms) | 1589 / 2889 |

## 2026-07-19T07:02:10.236Z — contract=shapes model=freesolo (flash-1784443906-8482fbda) split=eval n=165

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 98.8% |
| Builder errors (transport/truncation/parse/schema) | 2 |
| Schema-valid rate (zod re-check, shapes-v1) | 98.8% |
| Per-detection op accuracy | 87.4% |
| Snap accuracy (exact, absent=none) | 65.3% |
| Params accuracy (fill/gradient/text, loose) | 94.0% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 2.7% |
| Abstention precision / recall / F1 | 0.500 / 0.289 / 0.367 |
| Latency p50 / p95 (ms) | 750 / 1636 |

## 2026-07-19T07:04:00.301Z — contract=shapes model=freesolo (flash-1784442114-343653f1) split=eval n=30 concurrency=1

| Metric | Value |
|---|---|
| Examples (split=eval) | 30 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 92.9% |
| Snap accuracy (exact, absent=none) | 85.7% |
| Params accuracy (fill/gradient/text, loose) | 100.0% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.0% |
| Abstention precision / recall / F1 | 0.000 / 0.000 / 0.000 |
| Latency p50 / p95 (ms) | 779 / 1055 |

## 2026-07-19T07:04:12.094Z — contract=shapes model=freesolo (flash-1784442114-343653f1) split=eval n=30 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 30 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 89.3% |
| Snap accuracy (exact, absent=none) | 85.2% |
| Params accuracy (fill/gradient/text, loose) | 100.0% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.0% |
| Abstention precision / recall / F1 | 0.000 / 0.000 / 0.000 |
| Latency p50 / p95 (ms) | 1002 / 1163 |

## 2026-07-19T07:04:35.435Z — contract=shapes model=freesolo (flash-1784443906-8482fbda) split=eval n=80

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 83.4% |
| Snap accuracy (exact, absent=none) | 71.5% |
| Params accuracy (fill/gradient/text, loose) | 99.4% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 1.4% |
| Abstention precision / recall / F1 | 0.804 / 0.902 / 0.851 |
| Latency p50 / p95 (ms) | 1729 / 2889 |

## 2026-07-19T07:04:51.333Z — contract=shapes model=freesolo (flash-1784442114-343653f1) split=eval n=30 concurrency=1

| Metric | Value |
|---|---|
| Examples (split=eval) | 30 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 92.9% |
| Snap accuracy (exact, absent=none) | 85.7% |
| Params accuracy (fill/gradient/text, loose) | 100.0% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.0% |
| Abstention precision / recall / F1 | 0.000 / 0.000 / 0.000 |
| Latency p50 / p95 (ms) | 710 / 965 |

## 2026-07-19T07:05:05.119Z — contract=shapes model=freesolo (flash-1784442114-343653f1) split=eval n=30 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 30 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 89.3% |
| Snap accuracy (exact, absent=none) | 85.2% |
| Params accuracy (fill/gradient/text, loose) | 100.0% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.0% |
| Abstention precision / recall / F1 | 0.000 / 0.000 / 0.000 |
| Latency p50 / p95 (ms) | 949 / 1260 |

## 2026-07-19T07:06:38.706Z — contract=shapes model=freesolo (flash-1784442114-343653f1) split=eval n=165 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 86.8% |
| Snap accuracy (exact, absent=none) | 73.0% |
| Params accuracy (fill/gradient/text, loose) | 94.0% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.0% |
| Abstention precision / recall / F1 | 0.680 / 0.447 / 0.540 |
| Latency p50 / p95 (ms) | 1022 / 2125 |

## 2026-07-19T07:09:21.371Z — contract=shapes model=freesolo (flash-1784444166-483c91d1) split=eval n=165 concurrency=1

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 99.4% |
| Builder errors (transport/truncation/parse/schema) | 1 |
| Schema-valid rate (zod re-check, shapes-v1) | 99.4% |
| Per-detection op accuracy | 83.0% |
| Snap accuracy (exact, absent=none) | 65.2% |
| Params accuracy (fill/gradient/text, loose) | 75.9% |
| Hallucinated-command rate | 17.0% |
| Missed-detection rate | 0.5% |
| Abstention precision / recall / F1 | 0.412 / 0.368 / 0.389 |
| Latency p50 / p95 (ms) | 1126 / 2616 |

## 2026-07-19T07:09:54.067Z — contract=shapes model=freesolo (flash-1784444537-bb09aa8c) split=eval n=165 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 98.2% |
| Builder errors (transport/truncation/parse/schema) | 3 |
| Schema-valid rate (zod re-check, shapes-v1) | 98.2% |
| Per-detection op accuracy | 83.0% |
| Snap accuracy (exact, absent=none) | 70.7% |
| Params accuracy (fill/gradient/text, loose) | 70.2% |
| Hallucinated-command rate | 11.4% |
| Missed-detection rate | 1.4% |
| Abstention precision / recall / F1 | 0.400 / 0.211 / 0.276 |
| Latency p50 / p95 (ms) | 1544 / 3594 |

## 2026-07-19T07:17:47.049Z — contract=shapes model=freesolo (flash-1784444166-483c91d1) split=eval n=160 concurrency=1

| Metric | Value |
|---|---|
| Examples (split=eval) | 160 |
| Parse/schema-valid rate (client gate) | 98.1% |
| Builder errors (transport/truncation/parse/schema) | 3 |
| Schema-valid rate (zod re-check, shapes-v1) | 96.9% |
| Per-detection op accuracy | 76.0% |
| Snap accuracy (exact, absent=none) | 70.2% |
| Params accuracy (fill/gradient/text, loose) | 68.8% |
| Hallucinated-command rate | 4.2% |
| Missed-detection rate | 6.3% |
| Abstention precision / recall / F1 | 0.357 / 0.469 / 0.405 |
| Latency p50 / p95 (ms) | 2259 / 4300 |

## 2026-07-19T07:22:04.962Z — contract=shapes model=freesolo (flash-1784444539-b2d043a5) split=eval n=165 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 99.4% |
| Builder errors (transport/truncation/parse/schema) | 1 |
| Schema-valid rate (zod re-check, shapes-v1) | 95.2% |
| Per-detection op accuracy | 92.3% |
| Snap accuracy (exact, absent=none) | 71.4% |
| Params accuracy (fill/gradient/text, loose) | 95.2% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.5% |
| Abstention precision / recall / F1 | 1.000 / 0.105 / 0.190 |
| Latency p50 / p95 (ms) | 1707 / 3090 |

## 2026-07-19T07:22:55.545Z — contract=shapes model=freesolo (flash-1784444566-bc20a42c) split=eval n=165 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 100.0% |
| Per-detection op accuracy | 80.2% |
| Snap accuracy (exact, absent=none) | 69.9% |
| Params accuracy (fill/gradient/text, loose) | 91.6% |
| Hallucinated-command rate | 6.4% |
| Missed-detection rate | 0.5% |
| Abstention precision / recall / F1 | 0.381 / 0.421 / 0.400 |
| Latency p50 / p95 (ms) | 1410 / 2728 |

## 2026-07-19T07:23:47.451Z — contract=shapes model=freesolo (flash-1784444567-2001efa7) split=eval n=165 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 165 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Schema-valid rate (zod re-check, shapes-v1) | 98.8% |
| Per-detection op accuracy | 89.0% |
| Snap accuracy (exact, absent=none) | 74.7% |
| Params accuracy (fill/gradient/text, loose) | 96.4% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate | 0.5% |
| Abstention precision / recall / F1 | 1.000 / 0.184 / 0.311 |
| Latency p50 / p95 (ms) | 1419 / 2801 |

## 2026-07-19T07:37:46.861Z — contract=shapes model=freesolo (flash-1784444539-b2d043a5) split=eval n=160 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 160 |
| Parse/schema-valid rate (client gate) | 99.4% |
| Builder errors (transport/truncation/parse/schema) | 1 |
| Schema-valid rate (zod re-check, shapes-v1) | 90.0% |
| Per-detection op accuracy | 96.5% |
| Snap accuracy (exact, absent=none) | 82.8% |
| Params accuracy (fill/gradient/text, loose) | 98.1% |
| Hallucinated-command rate | 0.5% |
| Missed-detection rate | 1.3% |
| Abstention precision / recall / F1 | 0.946 / 0.547 / 0.693 |
| Latency p50 / p95 (ms) | 3290 / 5609 |

## 2026-07-19T08:52:57.525Z — contract=shapes-v3 model=freesolo (flash-1784450348-d593052f) split=eval n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 98.8% |
| Builder errors (transport/truncation/parse/schema) | 1 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 42.5% |
| Per-detection op accuracy | 74.6% |
| Snap accuracy (exact, absent=none) | 73.4% |
| Params accuracy (fill/gradient/text, loose) | 73.7% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 23.9% |
| Containment-respected rate (rows with zero child-spawned commands) | 84.8% |
| Child-spawned-command rate (commands answering a child detection) | 6.4% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | 0.0% |
| Hallucinated-command rate | 43.8% |
| Missed-detection rate (top-level detections) | 1.5% |
| Abstention precision / recall / F1 | 0.459 / 0.848 / 0.595 |
| Latency p50 / p95 (ms) | 4539 / 35175 |

## 2026-07-19T08:53:15.374Z — contract=shapes-v3 model=baseline (gemini-flash-lite-latest) split=eval n=80 concurrency=1

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 98.8% |
| Builder errors (transport/truncation/parse/schema) | 1 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 78.8% |
| Per-detection op accuracy | 75.0% |
| Snap accuracy (exact, absent=none) | 87.9% |
| Params accuracy (fill/gradient/text, loose) | 71.6% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 58.7% |
| Containment-respected rate (rows with zero child-spawned commands) | 100.0% |
| Child-spawned-command rate (commands answering a child detection) | 0.0% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | 25.0% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate (top-level detections) | 2.7% |
| Abstention precision / recall / F1 | 0.511 / 0.978 / 0.672 |
| Latency p50 / p95 (ms) | 987 / 1362 |

## 2026-07-19T08:53:46.515Z — contract=shapes-v3 model=freesolo (flash-1784450349-0208c55f) split=eval n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 63.8% |
| Per-detection op accuracy | 70.8% |
| Snap accuracy (exact, absent=none) | 73.5% |
| Params accuracy (fill/gradient/text, loose) | 75.7% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 32.6% |
| Containment-respected rate (rows with zero child-spawned commands) | 87.5% |
| Child-spawned-command rate (commands answering a child detection) | 3.2% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | 0.0% |
| Hallucinated-command rate | 1.3% |
| Missed-detection rate (top-level detections) | 9.1% |
| Abstention precision / recall / F1 | 0.486 / 0.783 / 0.600 |
| Latency p50 / p95 (ms) | 2956 / 4426 |

## 2026-07-19T08:54:37.856Z — contract=shapes-v3 model=freesolo (flash-1784450350-52ccc6e8) split=eval n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 77.5% |
| Per-detection op accuracy | 79.9% |
| Snap accuracy (exact, absent=none) | 74.7% |
| Params accuracy (fill/gradient/text, loose) | 89.6% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 58.7% |
| Containment-respected rate (rows with zero child-spawned commands) | 88.8% |
| Child-spawned-command rate (commands answering a child detection) | 2.7% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | 0.0% |
| Hallucinated-command rate | 0.3% |
| Missed-detection rate (top-level detections) | 1.8% |
| Abstention precision / recall / F1 | 0.618 / 0.913 / 0.737 |
| Latency p50 / p95 (ms) | 3103 / 5894 |

## 2026-07-19T08:58:54.161Z — contract=shapes-v3 model=freesolo (flash-1784450351-0081578d) split=eval n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 85.0% |
| Per-detection op accuracy | 93.0% |
| Snap accuracy (exact, absent=none) | 81.6% |
| Params accuracy (fill/gradient/text, loose) | 98.7% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 80.4% |
| Containment-respected rate (rows with zero child-spawned commands) | 100.0% |
| Child-spawned-command rate (commands answering a child detection) | 0.0% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | 75.0% |
| Hallucinated-command rate | 1.5% |
| Missed-detection rate (top-level detections) | 0.0% |
| Abstention precision / recall / F1 | 0.979 / 1.000 / 0.989 |
| Latency p50 / p95 (ms) | 3677 / 8196 |

## 2026-07-19T09:00:07.848Z — contract=shapes-v3 model=freesolo (flash-1784450352-965bf6b6) split=eval n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 78.8% |
| Per-detection op accuracy | 96.5% |
| Snap accuracy (exact, absent=none) | 86.2% |
| Params accuracy (fill/gradient/text, loose) | 99.4% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 93.5% |
| Containment-respected rate (rows with zero child-spawned commands) | 100.0% |
| Child-spawned-command rate (commands answering a child detection) | 0.0% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | 100.0% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate (top-level detections) | 0.3% |
| Abstention precision / recall / F1 | 1.000 / 0.913 / 0.955 |
| Latency p50 / p95 (ms) | 3971 / 8590 |

## 2026-07-19T09:01:48.763Z — contract=shapes-v3 model=freesolo (flash-1784450352-965bf6b6) split=test n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=test) | 80 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 82.5% |
| Per-detection op accuracy | 96.7% |
| Snap accuracy (exact, absent=none) | 89.1% |
| Params accuracy (fill/gradient/text, loose) | 97.8% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 90.0% |
| Containment-respected rate (rows with zero child-spawned commands) | 100.0% |
| Child-spawned-command rate (commands answering a child detection) | 0.0% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | 100.0% |
| Hallucinated-command rate | 1.7% |
| Missed-detection rate (top-level detections) | 0.0% |
| Abstention precision / recall / F1 | 1.000 / 0.950 / 0.974 |
| Latency p50 / p95 (ms) | 4157 / 7595 |

## 2026-07-19T10:19:35.182Z — contract=shapes-v3 model=freesolo (flash-1784450352-965bf6b6) split=test n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=test) | 80 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 80.0% |
| Per-detection op accuracy | 96.0% |
| Snap accuracy (exact, absent=none) | 88.8% |
| Params accuracy (fill/gradient/text, loose) | 98.4% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 95.0% |
| Containment-respected rate (rows with zero child-spawned commands) | 100.0% |
| Child-spawned-command rate (commands answering a child detection) | 0.0% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | 100.0% |
| Style-word routing accuracy (descriptor → fill/gradient params, not label; v3.1) | n/a |
| Descriptor-wrongly-labeled (descriptor word emitted in label) | 0 |
| Composite→op accuracy (gold op = detection composite hint; v3.1) | n/a |
| Composite-abstention accuracy (composite-less big scribbles → wait; v3.1) | n/a |
| Hallucinated-command rate | 1.7% |
| Missed-detection rate (top-level detections) | 0.0% |
| Abstention precision / recall / F1 | 1.000 / 0.950 / 0.974 |
| Latency p50 / p95 (ms) | 3658 / 7311 |

## 2026-07-19T10:30:51.056Z — contract=shapes-v3 model=freesolo (flash-1784450352-965bf6b6) split=eval n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 53.8% |
| Per-detection op accuracy | 87.3% |
| Snap accuracy (exact, absent=none) | 87.0% |
| Params accuracy (fill/gradient/text, loose) | 92.8% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 77.8% |
| Containment-respected rate (rows with zero child-spawned commands) | 76.3% |
| Child-spawned-command rate (commands answering a child detection) | 8.6% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | n/a |
| Style-word routing accuracy (descriptor → fill/gradient params, not label; v3.1) | 10.0% |
| Descriptor-wrongly-labeled (descriptor word emitted in label) | 7 |
| Composite→op accuracy (gold op = detection composite hint; v3.1) | 0.0% |
| Composite-abstention accuracy (composite-less big scribbles → wait; v3.1) | 92.3% |
| Hallucinated-command rate | 1.7% |
| Missed-detection rate (top-level detections) | 6.1% |
| Abstention precision / recall / F1 | 1.000 / 0.795 / 0.886 |
| Latency p50 / p95 (ms) | 3504 / 6857 |

## 2026-07-19T10:36:06.736Z — contract=shapes-v3 model=baseline (gemini-flash-lite-latest) split=eval n=80 concurrency=1

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 83.8% |
| Per-detection op accuracy | 76.3% |
| Snap accuracy (exact, absent=none) | 90.6% |
| Params accuracy (fill/gradient/text, loose) | 74.0% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 57.4% |
| Containment-respected rate (rows with zero child-spawned commands) | 100.0% |
| Child-spawned-command rate (commands answering a child detection) | 0.0% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | n/a |
| Style-word routing accuracy (descriptor → fill/gradient params, not label; v3.1) | 0.0% |
| Descriptor-wrongly-labeled (descriptor word emitted in label) | 9 |
| Composite→op accuracy (gold op = detection composite hint; v3.1) | 100.0% |
| Composite-abstention accuracy (composite-less big scribbles → wait; v3.1) | 100.0% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate (top-level detections) | 0.6% |
| Abstention precision / recall / F1 | 0.482 / 0.932 / 0.636 |
| Latency p50 / p95 (ms) | 1019 / 1416 |

## 2026-07-19T10:55:37.775Z — contract=shapes-v3 model=freesolo (flash-1784456965-9ad13242) split=eval n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 83.8% |
| Per-detection op accuracy | 85.3% |
| Snap accuracy (exact, absent=none) | 73.9% |
| Params accuracy (fill/gradient/text, loose) | 90.5% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 72.2% |
| Containment-respected rate (rows with zero child-spawned commands) | 98.8% |
| Child-spawned-command rate (commands answering a child detection) | 0.3% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | n/a |
| Style-word routing accuracy (descriptor → fill/gradient params, not label; v3.1) | 20.0% |
| Descriptor-wrongly-labeled (descriptor word emitted in label) | 2 |
| Composite→op accuracy (gold op = detection composite hint; v3.1) | 66.7% |
| Composite-abstention accuracy (composite-less big scribbles → wait; v3.1) | 88.5% |
| Hallucinated-command rate | 0.6% |
| Missed-detection rate (top-level detections) | 2.0% |
| Abstention precision / recall / F1 | 0.791 / 0.773 / 0.782 |
| Latency p50 / p95 (ms) | 2575 / 4331 |

## 2026-07-19T10:56:23.044Z — contract=shapes-v3 model=freesolo (flash-1784456966-06cf95d9) split=eval n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 98.8% |
| Builder errors (transport/truncation/parse/schema) | 1 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 76.3% |
| Per-detection op accuracy | 88.0% |
| Snap accuracy (exact, absent=none) | 83.9% |
| Params accuracy (fill/gradient/text, loose) | 93.9% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 72.2% |
| Containment-respected rate (rows with zero child-spawned commands) | 98.7% |
| Child-spawned-command rate (commands answering a child detection) | 0.3% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | n/a |
| Style-word routing accuracy (descriptor → fill/gradient params, not label; v3.1) | 20.0% |
| Descriptor-wrongly-labeled (descriptor word emitted in label) | 0 |
| Composite→op accuracy (gold op = detection composite hint; v3.1) | 66.7% |
| Composite-abstention accuracy (composite-less big scribbles → wait; v3.1) | 92.3% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate (top-level detections) | 5.2% |
| Abstention precision / recall / F1 | 0.930 / 0.909 / 0.920 |
| Latency p50 / p95 (ms) | 2478 / 4340 |

## 2026-07-19T10:58:21.178Z — contract=shapes-v3 model=freesolo (flash-1784456967-5a2f2897) split=eval n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 100.0% |
| Builder errors (transport/truncation/parse/schema) | 0 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 78.8% |
| Per-detection op accuracy | 92.3% |
| Snap accuracy (exact, absent=none) | 88.9% |
| Params accuracy (fill/gradient/text, loose) | 92.6% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 83.3% |
| Containment-respected rate (rows with zero child-spawned commands) | 100.0% |
| Child-spawned-command rate (commands answering a child detection) | 0.0% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | n/a |
| Style-word routing accuracy (descriptor → fill/gradient params, not label; v3.1) | 20.0% |
| Descriptor-wrongly-labeled (descriptor word emitted in label) | 1 |
| Composite→op accuracy (gold op = detection composite hint; v3.1) | 33.3% |
| Composite-abstention accuracy (composite-less big scribbles → wait; v3.1) | 100.0% |
| Hallucinated-command rate | 0.9% |
| Missed-detection rate (top-level detections) | 0.0% |
| Abstention precision / recall / F1 | 0.913 / 0.955 / 0.933 |
| Latency p50 / p95 (ms) | 3521 / 6946 |

## 2026-07-19T10:59:44.392Z — contract=shapes-v3 model=freesolo (flash-1784456967-5a2f2897) split=test n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=test) | 80 |
| Parse/schema-valid rate (client gate) | 98.8% |
| Builder errors (transport/truncation/parse/schema) | 1 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 81.3% |
| Per-detection op accuracy | 92.1% |
| Snap accuracy (exact, absent=none) | 92.3% |
| Params accuracy (fill/gradient/text, loose) | 93.6% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 80.5% |
| Containment-respected rate (rows with zero child-spawned commands) | 98.7% |
| Child-spawned-command rate (commands answering a child detection) | 0.3% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | 50.0% |
| Style-word routing accuracy (descriptor → fill/gradient params, not label; v3.1) | 37.5% |
| Descriptor-wrongly-labeled (descriptor word emitted in label) | 1 |
| Composite→op accuracy (gold op = detection composite hint; v3.1) | 33.3% |
| Composite-abstention accuracy (composite-less big scribbles → wait; v3.1) | 100.0% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate (top-level detections) | 0.9% |
| Abstention precision / recall / F1 | 0.957 / 0.978 / 0.967 |
| Latency p50 / p95 (ms) | 3506 / 7047 |

## 2026-07-19T11:11:15.210Z — contract=shapes-v3 model=freesolo (flash-1784456967-5a2f2897) split=eval n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 97.5% |
| Builder errors (transport/truncation/parse/schema) | 2 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 87.5% |
| Per-detection op accuracy | 90.4% |
| Snap accuracy (exact, absent=none) | 92.3% |
| Params accuracy (fill/gradient/text, loose) | 90.5% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 87.9% |
| Containment-respected rate (rows with zero child-spawned commands) | 100.0% |
| Child-spawned-command rate (commands answering a child detection) | 0.0% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | 100.0% |
| Style-word routing accuracy (descriptor → fill/gradient params, not label; v3.1) | 40.0% |
| Descriptor-wrongly-labeled (descriptor word emitted in label) | 3 |
| Composite→op accuracy (gold op = detection composite hint; v3.1) | 68.2% |
| Composite-abstention accuracy (composite-less big scribbles → wait; v3.1) | 92.3% |
| Hallucinated-command rate | 0.0% |
| Missed-detection rate (top-level detections) | 4.7% |
| Abstention precision / recall / F1 | 0.828 / 0.889 / 0.857 |
| Latency p50 / p95 (ms) | 3818 / 7632 |

## 2026-07-19T11:18:56.120Z — contract=shapes-v3 model=freesolo (flash-1784459334-93c48223) split=eval n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 93.8% |
| Builder errors (transport/truncation/parse/schema) | 5 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 72.5% |
| Per-detection op accuracy | 83.7% |
| Snap accuracy (exact, absent=none) | 88.1% |
| Params accuracy (fill/gradient/text, loose) | 87.6% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 58.6% |
| Containment-respected rate (rows with zero child-spawned commands) | 97.3% |
| Child-spawned-command rate (commands answering a child detection) | 0.5% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | 100.0% |
| Style-word routing accuracy (descriptor → fill/gradient params, not label; v3.1) | 33.3% |
| Descriptor-wrongly-labeled (descriptor word emitted in label) | 1 |
| Composite→op accuracy (gold op = detection composite hint; v3.1) | 63.6% |
| Composite-abstention accuracy (composite-less big scribbles → wait; v3.1) | 84.6% |
| Hallucinated-command rate | 0.8% |
| Missed-detection rate (top-level detections) | 10.4% |
| Abstention precision / recall / F1 | 0.952 / 0.741 / 0.833 |
| Latency p50 / p95 (ms) | 4399 / 72198 |

## 2026-07-19T11:21:48.671Z — contract=shapes-v3 model=freesolo (flash-1784459335-6b259cce) split=eval n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 93.8% |
| Builder errors (transport/truncation/parse/schema) | 5 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 77.5% |
| Per-detection op accuracy | 88.0% |
| Snap accuracy (exact, absent=none) | 86.4% |
| Params accuracy (fill/gradient/text, loose) | 88.7% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 67.2% |
| Containment-respected rate (rows with zero child-spawned commands) | 100.0% |
| Child-spawned-command rate (commands answering a child detection) | 0.0% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | 100.0% |
| Style-word routing accuracy (descriptor → fill/gradient params, not label; v3.1) | 50.0% |
| Descriptor-wrongly-labeled (descriptor word emitted in label) | 5 |
| Composite→op accuracy (gold op = detection composite hint; v3.1) | 63.6% |
| Composite-abstention accuracy (composite-less big scribbles → wait; v3.1) | 84.6% |
| Hallucinated-command rate | 0.5% |
| Missed-detection rate (top-level detections) | 9.0% |
| Abstention precision / recall / F1 | 0.846 / 0.815 / 0.830 |
| Latency p50 / p95 (ms) | 3022 / 59807 |

## 2026-07-19T11:33:27.503Z — contract=shapes-v3 model=freesolo (flash-1784460143-9bb63a38) split=eval n=80 concurrency=8

| Metric | Value |
|---|---|
| Examples (split=eval) | 80 |
| Parse/schema-valid rate (client gate) | 95.0% |
| Builder errors (transport/truncation/parse/schema) | 4 |
| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | 61.3% |
| Per-detection op accuracy | 79.5% |
| Snap accuracy (exact, absent=none) | 80.2% |
| Params accuracy (fill/gradient/text, loose) | 91.3% |
| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | 70.7% |
| Containment-respected rate (rows with zero child-spawned commands) | 92.1% |
| Child-spawned-command rate (commands answering a child detection) | 1.9% |
| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | 0.0% |
| Style-word routing accuracy (descriptor → fill/gradient params, not label; v3.1) | 56.7% |
| Descriptor-wrongly-labeled (descriptor word emitted in label) | 5 |
| Composite→op accuracy (gold op = detection composite hint; v3.1) | 72.7% |
| Composite-abstention accuracy (composite-less big scribbles → wait; v3.1) | 76.9% |
| Hallucinated-command rate | 2.9% |
| Missed-detection rate (top-level detections) | 10.9% |
| Abstention precision / recall / F1 | 0.909 / 0.741 / 0.816 |
| Latency p50 / p95 (ms) | 4528 / 41532 |
