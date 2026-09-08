import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useResource } from "../hooks.js";
import { AppShell } from "../components/layout.jsx";
import { EmptyState, Loading, StatCard, StatusPill } from "../components/ui.jsx";

export function AdminDashboard({ user, onLogout }) {
  const { data, error } = useResource(() => api.adminDashboard(), []);

  return (
    <AppShell role="admin" user={user} onLogout={onLogout}>
      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="page-header">
            <div>
              <h1>Examination Cell</h1>
              <div className="subtitle">Institution-wide overview of the evaluation pipeline.</div>
            </div>
            <Link className="btn btn-primary" to="/admin/answer-sheets">
              Open answer sheets
            </Link>
          </div>

          <div className="stat-grid">
            <StatCard label="Students" value={data.stats.students} />
            <StatCard label="Faculty" value={data.stats.faculty} />
            <StatCard label="Sheets processed" value={data.stats.sheetsProcessed} />
            <StatCard label="Open discrepancies" value={data.stats.openDiscrepancies} tone="warn" />
          </div>

          <h3 className="section-title">Escalations</h3>
          {data.escalations.length === 0 ? (
            <EmptyState>No escalations right now.</EmptyState>
          ) : (
            <div className="panel">
              {data.escalations.map((item) => (
                <div className="panel-row" key={item.id}>
                  <div className="grow">
                    <div className="title">{item.studentName} · {item.question}</div>
                    <div className="meta">{item.course?.code} · {item.createdAt}</div>
                  </div>
                  <StatusPill status={item.status} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

export function AdminStudents({ user, onLogout }) {
  const { data, error } = useResource(() => api.adminStudents(), []);

  return (
    <AppShell role="admin" user={user} onLogout={onLogout}>
      <div className="page-header">
        <div>
          <h1>Students</h1>
          <div className="subtitle">Registered student accounts and activity counts.</div>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && data.length === 0 && <EmptyState>No students found.</EmptyState>}
      {data && data.length > 0 && (
        <div className="panel table-panel">
          <div className="table-row table-head">
            <span>ID</span>
            <span>Name</span>
            <span>Sheets</span>
            <span>Requests</span>
          </div>
          {data.map((student) => (
            <div className="table-row" key={student.id}>
              <span>{student.id}</span>
              <span>{student.name}</span>
              <span>{student.sheetCount}</span>
              <span>{student.discrepancyCount}</span>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export function AdminFaculty({ user, onLogout }) {
  const { data, error } = useResource(() => api.adminFaculty(), []);

  return (
    <AppShell role="admin" user={user} onLogout={onLogout}>
      <div className="page-header">
        <div>
          <h1>Faculty</h1>
          <div className="subtitle">Faculty accounts and their current review load.</div>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && data.length === 0 && <EmptyState>No faculty found.</EmptyState>}
      {data && data.length > 0 && (
        <div className="panel table-panel">
          <div className="table-row table-head">
            <span>ID</span>
            <span>Name</span>
            <span>Designation</span>
            <span>Pending</span>
          </div>
          {data.map((member) => (
            <div className="table-row" key={member.id}>
              <span>{member.id}</span>
              <span>{member.name}</span>
              <span>{member.designation || "-"}</span>
              <span>{member.pendingCount}</span>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export function AdminExaminations({ user, onLogout }) {
  const { data, error } = useResource(() => api.adminExaminations(), []);

  return (
    <AppShell role="admin" user={user} onLogout={onLogout}>
      <div className="page-header">
        <div>
          <h1>Examinations</h1>
          <div className="subtitle">Current exam inventory and sheet counts.</div>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && data.length === 0 && <EmptyState>No examinations found.</EmptyState>}
      {data && data.length > 0 && (
        <div className="panel table-panel">
          <div className="table-row table-head">
            <span>Code</span>
            <span>Title</span>
            <span>Session</span>
            <span>Sheets</span>
          </div>
          {data.map((exam) => (
            <div className="table-row" key={exam.id}>
              <span>{exam.course?.code}</span>
              <span>{exam.title}</span>
              <span>{exam.session}</span>
              <span>{exam.sheetCount}</span>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export function AdminAnswerSheets({ user, onLogout }) {
  const { data, error } = useResource(() => api.adminAnswerSheets(), []);

  return (
    <AppShell role="admin" user={user} onLogout={onLogout}>
      <div className="page-header">
        <div>
          <h1>Answer Sheets</h1>
          <div className="subtitle">Every stored sheet, including drafts waiting to be published.</div>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && data.length === 0 && <EmptyState>No sheets found.</EmptyState>}
      {data && data.length > 0 && (
        <div className="panel">
          {data.map((sheet) => (
            <div className="panel-row" key={sheet.id}>
              <div className="grow">
                <div className="title">
                  {sheet.course?.code} · {sheet.studentName}
                </div>
                <div className="meta">
                  {sheet.exam?.session} · {sheet.id} · {sheet.fileName || "No file"}
                </div>
              </div>
              <StatusPill status={sheet.published ? "Resolved" : "Submitted"} />
              {sheet.fileUrl && (
                <a className="btn btn-outline" href={sheet.fileUrl} target="_blank" rel="noreferrer">
                  Open PDF
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
