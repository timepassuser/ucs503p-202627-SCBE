const PILL_CLASS = {
  Submitted: "pill-pending",
  "Under Review": "pill-pending",
  Escalated: "pill-escalated",
  Resolved: "pill-resolved",
  Accepted: "pill-resolved",
  Rejected: "pill-escalated",
};

export function StatCard({ label, value, tone }) {
  return (
    <div className={`stat-card ${tone || ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export function StatusPill({ status }) {
  return <span className={`pill ${PILL_CLASS[status] || "pill-info"}`}>{status}</span>;
}

export function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}

export function Loading({ label = "Loading…" }) {
  return <div className="loading-state">{label}</div>;
}
