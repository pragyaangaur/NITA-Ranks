# NITA Ranks

A fast, interactive way to compare and rank faculty members on campus. Check it out <a href="https://nita-ranks.vercel.app/">here</a>.

## What This Is
NITA Ranks is a lightweight experimental system for generating global rankings from local comparisons.
Instead of asking users to assign scores or ratings, the system repeatedly presents two faculty members at a time. Users select one. Over time, these binary decisions accumulate into a statistically meaningful ordering.
No explicit scoring is ever provided by the user. The ranking emerges entirely from interaction dynamics.

## Core Idea
Each faculty member is treated as a node in a competitive system. Every vote is a directed comparison: **A vs B → one wins, one loses.** 

From this, a global ordering emerges using an Elo-style rating system.

## Engagement Behavior

- Unique visitors: 800+  
- Total page views: 1,400+  
- Total direct social impressions: ~390
- Effective amplification factor: ~2×  
- Total votes: 7,611  
- Votes per visitor: ~10  
- Votes per page view: ~6
- Edge requests: 67,000+  

## Ranking System (Elo Model)
Each faculty member starts at a neutral baseline:
$$R_0 = 1500$$

When two faculty members are compared, the expected score for A is:  
$$\displaystyle E_A = \frac{1}{1 + 10^{\frac{R_B - R_A}{400}}}$$  

After the outcome, ratings update as:  
$$R'_A = R_A + K(1 - E_A)$$  
$$R'_B = R_B + K(0 - (1 - E_A))$$

Where $K = 32$. The system does not include any additional corrections such as decay, priors, or smoothing. Each update is independent, and the long-term structure emerges purely from repeated application of this rule.

## System Architecture
The project is split into two edge endpoints.

### 1. Vote Endpoint (`/api/vote`)
*   Accepts winner and loser IDs.
*   Fetches current scores from KV store, computes Elo update, and writes back state.
*   **Philosophy:** Each vote triggers: `SET score`, `INCR wins`, `INCR losses`, `INCR total_votes`. There is no batching, no queuing system, and no transactional layer. The design assumes that write operations should remain simple and stateless, even if this introduces eventual consistency instead of strict consistency.

### 2. Rankings Endpoint (`/api/rankings`)
*   Accepts `n` (faculty count).
*   Pulls all scores via KV pipeline and reconstructs ranking snapshot server-side.
*   **Philosophy:** The system does not cache precomputed rankings. Instead, it reconstructs the ranking dynamically from stored primitive values each time it is requested. This keeps the system transparent and easy to reason about, while increasing read overhead.

### Data Model
*   The underlying data model is intentionally minimal. Each faculty member is represented using three key-value entries:
*   **Per Faculty:** `score:<id>`, `wins:<id>`, `losses:<id>`.
*   **Global:** `total_votes`.
*   All higher-level structure is derived at read time from these primitives.
*   *Note: Faculty metadata such as name, department, and image is stored in a separate faculty.json file. This file is not included in the repository because it is being reused as a base dataset for other experiments built on top of the same comparison system.*

## UI Behavior
The frontend is built for speed:
*   Rapid pairwise voting with keyboard support (← / → / space).
*   **Optimistic updates:** The system uses optimistic updates, meaning the UI reflects the result of a vote immediately without waiting for confirmation from the server. This design choice is based on the assumption that perceived latency is more disruptive to user experience than temporary inconsistencies in state.

## Scale Event and System Reset
### Phase 1 — Initial Deployment
The system was initially deployed as a small-scale campus experiment but experienced significantly higher-than-expected interaction volume. Key metrics during this phase:  

| Metric | value |
| :--- | :--- |
| **Launch Timeline** | May 23, 10:45 PM – May 24, 12:00 PM |
| **Unique Visitors** | 800+ |
| **Page Views** | 1,400+ |
| **Total Votes Cast** | 7,611 |
| **Edge Requests** | 67,000+ |
| **API Operations** | 1,000,000+ (Limit Exhausted) |

<img src="Assets/edge-requests.png" width="450">

The operation count scaled disproportionately because rankings refresh triggered N×3 KV reads per request, and each vote also expanded into multiple atomic writes, creating significant read/write amplification relative to actual vote count.  

<p align="center">
<img src="Assets/website.png" width="800"></p>

### Phase 2 — Reset + Redeployment
Following infrastructure constraints and API storage limitations, the system was redeployed with an updated Upstash Redis configuration within 5 hours of the first error.

This redeployment introduced a clean state reset. Prior vote history and rankings were not migrated.

All current rankings are therefore computed from a fresh dataset under the same Elo model, ensuring consistency and correctness within the active deployment.

The system design remains unchanged in principle, but operates on a newly initialized state.

**NOTE:** This project is an experimental web development system created for learning and demonstration purposes by me as an individual. It is not officially affiliated with the National Institute of Technology Agartala or any other institution, and does not represent or intend to reflect the views, reputation, or conduct of any individual, department, or organization. Any resemblance to real evaluation or ranking systems is coincidental and unintentional. System state may reset or change during infrastructure updates, scaling adjustments, or architectural modifications.
