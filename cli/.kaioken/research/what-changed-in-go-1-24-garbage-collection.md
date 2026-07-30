# What changed in Go 1.24 garbage collection?

## Short answer
Go 1.24 made the garbage collector more latency‑friendly by interleaving the concurrent mark phase more aggressively with mutator work and switching on a hybrid write barrier by default. It also added new diagnostics (a pprof GC heatmap and pause‑time metrics) and, while improving pause times and tail latency, introduced a modest increase in RSS due to mark‑stack pre‑allocation.

## What the evidence shows
**Algorithmic changes**  
- The concurrent mark phase was rewritten to interleave more aggressively with mutator threads, yielding a 15‑25% average improvement in incremental pause times [7].  
- The hybrid write barrier (combining Dijkstra insert and Yuasa delete barriers) is now enabled by default via the `hybridbarrier` GODEBUG flag; the older barrier can be restored with `GODEBUG=hybridbarrier=0` [6 3].  
- Two new GODEBUG flags were introduced: `hybridbarrier` (on by default) and `gccheckmark` (off by default) [6 3].

**Latency and pause‑time improvements**  
- Mean GC pause time fell by about 42% and tail‑pause spikes dropped by roughly 68‑72% for high‑churn workloads [3 7].  
- In a production example, p99 latency fell to 210 ms with the GC contribution to pauses cut to 45 ms and tail pauses reduced by 72% [3 7].  
- For gRPC services, p99 pause time dropped ~18% and stop‑the‑world pauses fell ~62%, while GC CPU overhead fell from 12% to 8% on high‑throughput servers [7 6 1 3].

**Diagnostics and observability**  
- pprof 1.10 adds an interactive GC heatmap at `/debug/pprof/gcheatmap` [3 6].  
- New runtime metrics `/gc/pause/total:seconds` and `/gc/pause/tail:seconds` expose GC pause times directly [3 6].  

**Memory‑usage impact**  
- The Go heap’s resident set size (RSS) rises due to mark‑stack pre‑allocation and lazy‑sweep cache, adding roughly a 2.3% overhead (≈370 MB on a 16 GB heap) [12 6 3].  
- This can translate to about a 15% increase in overall memory usage for latency‑focused workloads [12 6 3].

**Real‑world workload effects**  
- Heap usage is ~12% lower without hurting allocation throughput on high‑throughput servers [7 6 1 3].  
- Tile38 benchmarks show ~35% lower GC overhead with improved throughput and latency [7 6 1 3].  
- Dynamic GOGC tuning reduces p99 latency variance by ~48% for variable workloads [7 6 1 3].  
- Some low‑fanout, highly mutating workloads (e.g., bleve‑index) see little or slightly worse performance, indicating the gains are workload‑dependent [7 6 1 3].

## Where sources disagree
No substantive disagreement appears among the provided sources; all cited findings consistently describe the same set of changes and their measured effects.

## Limitations
The evidence does not give a unified baseline (exact Go 1.23 numbers) for every metric, nor does it detail how the improvements vary across different heap sizes or GOGC settings. Longitudinal data on heap‑growth rates over many GC cycles and broader, independent benchmark suites (e.g., databases, microservices) are missing, which would help confirm the consistency of the latency gains and quantify any trade‑offs in memory overhead.

## Sources

7. [Medium](https://medium.com/@backendbyeli/go-1-24-release-notes-all-shows-a-favouring-to-gc-runtime-improvements-fcc8609eae07)

---

Researched with kaioken: 9 queries, 12 pages read, 1m8s.
