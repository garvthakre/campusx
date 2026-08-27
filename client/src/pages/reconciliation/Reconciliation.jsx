import { useState } from "react";
import { AlertCircle, Check, Play, RefreshCw, X } from "lucide-react";
import { useGetMetricsQuery, useGetResultsQuery, useReviewResultMutation, useRunReconciliationMutation, useToggleSimulationMutation } from "../../redux/reconciliation/reconciliationApi";
import "./Reconciliation.css";

const percent = (value = 0) => `${(value * 100).toFixed(1)}%`;

export default function Reconciliation() {
  const { data: metrics, isLoading: metricsLoading } = useGetMetricsQuery();
  const { data: results = [], isLoading: resultsLoading } = useGetResultsQuery();
  const [run, { isLoading: running }] = useRunReconciliationMutation();
  const [review] = useReviewResultMutation();
  const [toggleSimulation] = useToggleSimulationMutation();
  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const [error, setError] = useState("");

  async function runAgent() {
    setError("");
    try { await run().unwrap(); } catch (requestError) { setError(requestError?.data?.message || "The reconciliation run could not be started."); }
  }
  async function decide(id, decision) {
    try { await review({ id, decision }).unwrap(); } catch (requestError) { setError(requestError?.data?.message || "This result has already been reviewed."); }
  }
  async function toggleFailure() { const enabled = !simulationEnabled; await toggleSimulation(enabled).unwrap(); setSimulationEnabled(enabled); }

  const exceptions = results.filter((result) => result.exceptionType);
  return (
    <main className="reconciliation-page">
      <header className="reconciliation-header">
        <div><p className="eyebrow">FINANCE CONTROL</p><h1>LedgerMatch</h1><p className="subtitle">Review settlement confidence before anything reaches the payout system.</p></div>
        <div className="header-actions"><button className="demo-toggle" onClick={toggleFailure}>{simulationEnabled ? "Failure simulation on" : "Simulate LLM failure"}</button><button className="run-button" onClick={runAgent} disabled={running}><Play size={16} /> {running ? "Running..." : "Run reconciliation"}</button></div>
      </header>
      {error && <div className="reconciliation-error"><AlertCircle size={18} />{error}</div>}
      <section className="metric-grid">
        <article><span>Match rate</span><strong>{metricsLoading ? "..." : percent(metrics?.matchRate)}</strong><small>Exact + fuzzy matches</small></article>
        <article><span>Total records</span><strong>{metricsLoading ? "..." : metrics?.total || 0}</strong><small>Awaiting review included</small></article>
        <article><span>Exceptions</span><strong>{metricsLoading ? "..." : exceptions.length}</strong><small>Needs a human decision</small></article>
        <article><span>False-positive rate</span><strong>{metricsLoading ? "..." : percent(metrics?.falsePositiveRate)}</strong><small>Measured against planted cases</small></article>
      </section>
      <section className="breakdown-grid">
        <div className="panel"><div className="panel-title"><h2>Match tiers</h2><RefreshCw size={16} /></div>{Object.entries(metrics?.tierBreakdown || {}).map(([tier, count]) => <div className="bar-row" key={tier}><span>{tier}</span><div><i style={{ width: `${metrics?.total ? count / metrics.total * 100 : 0}%` }} /></div><b>{count}</b></div>)}</div>
        <div className="panel"><div className="panel-title"><h2>Exception types</h2><AlertCircle size={16} /></div>{Object.entries(metrics?.exceptionBreakdown || {}).filter(([, count]) => count).map(([type, count]) => <div className="exception-row" key={type}><span>{type.replaceAll("_", " ")}</span><b>{count}</b></div>)}</div>
      </section>
      <section className="panel results-panel"><div className="panel-title"><h2>Review queue</h2><span>{resultsLoading ? "Loading..." : `${exceptions.length} exceptions`}</span></div><div className="table-wrap"><table><thead><tr><th>Record</th><th>Tier</th><th>Exception</th><th>Suggested action</th><th>Status</th><th /></tr></thead><tbody>{exceptions.map((result) => <tr key={result._id}><td>{result.ledgerRecordId || "Orphan settlement"}</td><td>{result.matchTier}</td><td>{result.exceptionType?.replaceAll("_", " ")}</td><td>{result.suggestedAction}</td><td>{result.status}</td><td className="actions"><button title="Approve" onClick={() => decide(result._id, "approve")}><Check size={16} /></button><button title="Reject" onClick={() => decide(result._id, "reject")}><X size={16} /></button></td></tr>)}</tbody></table>{!resultsLoading && !exceptions.length && <p className="empty">No exceptions are waiting for review.</p>}</div></section>
    </main>
  );
}
