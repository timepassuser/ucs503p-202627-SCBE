import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useResource } from "../hooks.js";
import { AppShell } from "../components/layout.jsx";
import { EmptyState, Loading, StatCard, StatusPill } from "../components/ui.jsx";

function sheetScore(sheet) {
  return `${sheet.totals.current}/${sheet.totals.max}`;
}

export function StudentDashboard({ user, onLogout }) {
  const { data, error } = useResource(() => api.studentDashboard(user.id), [user.id]);

  return (
    <AppShell role="student" user={user} onLogout={onLogout}>
      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="page-header">
            <div>
              <h1>Welcome back, {user.name.split(" ")[0]}</h1>
              <div className="subtitle">
                {user.programme} · Semester {user.semester} · Roll No {user.id}
              </div>
            </div>
            <div className="header-actions">
              <Link className="btn btn-outline" to="/student/requests">
                Submitted Complaints
              </Link>
              <Link className="btn btn-primary" to="/student/sheets">
                Open answer sheets
              </Link>
            </div>
          </div>

          <div className="stat-grid">
            <StatCard label="Examinations" value={data.stats.examinations} />
            <StatCard label="Sheets available" value={data.stats.sheetsAvailable} />
            <StatCard label="Pending requests" value={data.stats.pendingDiscrepancies} tone="warn" />
            <StatCard label="Resolved" value={data.stats.resolvedDiscrepancies} tone="success" />
            <StatCard label="Marks revised" value={`+${data.stats.marksGained}`} tone="success" />
          </div>

          <div className="two-col">
            <section>
              <h3 className="section-title">
                Available answer sheets <Link to="/student/sheets">View all</Link>
              </h3>
              {data.sheets.length === 0 ? (
                <EmptyState>No answer sheets released yet.</EmptyState>
              ) : (
                <div className="panel">
                  {data.sheets.slice(0, 5).map((sheet) => (
                    <div className="panel-row" key={sheet.id}>
                      <div className="grow">
                        <div className="title">
                          {sheet.course?.code} · {sheet.course?.title}
                        </div>
                        <div className="meta">
                          {sheet.exam?.title} · {sheet.exam?.session} · Booklet {sheet.id}
                        </div>
                      </div>
                      <div className="score-block">
                        <div className="score">{sheetScore(sheet)}</div>
                        {sheet.totals.current !== sheet.totals.original && (
                          <div className="meta success-text">revised from {sheet.totals.original}</div>
                        )}
                      </div>
                      <Link className="btn btn-outline" to={`/student/sheets/${sheet.id}/view`}>
                        Open viewer
                      </Link>
                    </div>
                  ))}
                </div>
              )}

              <h3 className="section-title section-gap">Recent complaints</h3>
              {data.discrepancies.length === 0 ? (
                <EmptyState>No complaints submitted yet.</EmptyState>
              ) : (
                <div className="panel">
                  {data.discrepancies.slice(0, 5).map((request) => (
                    <div className="panel-row" key={request.id}>
                      <div className="grow">
                        <div className="title">
                          {request.question} - {request.sheetId}
                        </div>
                        <div className="meta">{request.createdAt}</div>
                      </div>
                      <StatusPill status={request.status} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="section-title">Notifications</h3>
              {data.notifications.length === 0 ? (
                <EmptyState>No notifications.</EmptyState>
              ) : (
                <div className="panel">
                  {data.notifications.slice(0, 6).map((notification) => (
                    <div className="panel-row" key={notification.id}>
                      <div className="grow">
                        <div className="title">{notification.message}</div>
                        <div className="meta">{notification.createdAt}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </AppShell>
  );
}

export function StudentSheets({ user, onLogout }) {
  const { data, error } = useResource(() => api.studentSheets(user.id), [user.id]);

  return (
    <AppShell role="student" user={user} onLogout={onLogout}>
      <div className="page-header">
        <div>
          <h1>Answer Sheets</h1>
          <div className="subtitle">Published answer sheets for your enrolled examinations.</div>
        </div>
        <Link className="btn btn-primary" to="/student/dashboard">
          Back to dashboard
        </Link>
      </div>

      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && data.length === 0 && <EmptyState>No published sheets are available yet.</EmptyState>}
      {data && data.length > 0 && (
        <div className="panel">
          {data.map((sheet) => (
            <div className="panel-row" key={sheet.id}>
              <div className="grow">
                <div className="title">
                  {sheet.course?.code} · {sheet.course?.title}
                </div>
                <div className="meta">
                  {sheet.exam?.title} · {sheet.exam?.session} · Booklet {sheet.id}
                </div>
              </div>
              <div className="score-block">
                <div className="score">{sheetScore(sheet)}</div>
                <div className="meta">{sheet.published ? "Published" : "Draft"}</div>
              </div>
              <Link className="btn btn-outline" to={`/student/sheets/${sheet.id}/view`}>
                Open viewer
              </Link>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export function StudentSheetViewer({ user, onLogout }) {
  const { sheetId } = useParams();
  const { data, error } = useResource(() => api.sheet(sheetId, user.id), [sheetId, user.id]);
  const [question, setQuestion] = useState("Total");
  const [customQuestion, setCustomQuestion] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!data?.evaluations?.length) return;
    setQuestion(data.evaluations[0].question);
  }, [data]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setSuccess("");
    setSubmitting(true);
    try {
      const selectedQuestion = question === "Custom" ? customQuestion.trim() : question;
      if (!selectedQuestion || !message.trim()) {
        throw new Error("Choose a question and enter a message.");
      }
      await api.submitDiscrepancy({
        sheetId: data.id,
        studentId: user.id,
        question: selectedQuestion,
        message,
      });
      setSuccess("Your request was submitted for review.");
      setMessage("");
    } catch (err) {
      setSuccess("");
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const questionOptions = [
    ...(data?.evaluations?.map((evaluation) => evaluation.question) || []),
    "Total",
    "Custom",
  ];

  return (
    <AppShell role="student" user={user} onLogout={onLogout}>
      <div className="page-header">
        <div>
          <h1>Sheet Viewer</h1>
          <div className="subtitle">Booklet {sheetId}</div>
        </div>
        {data?.fileUrl && (
          <a className="btn btn-outline" href={data.fileUrl} target="_blank" rel="noreferrer">
            Open PDF
          </a>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && (
        <div className="viewer-layout">
          <section className="sheet-page">
            <div className="sheet-page-header">
              <div className="sheet-title">{data.course?.code} · {data.course?.title}</div>
              <div className="sheet-meta">{data.exam?.title} · {data.exam?.session}</div>
            </div>
            <div className="sheet-paper">
              <div className="sheet-paper-line">Student: {data.studentName}</div>
              <div className="sheet-paper-line">Roll No: {data.detectedRollNumber || user.id}</div>
              <div className="sheet-paper-line">Status: {data.published ? "Published" : "Draft"}</div>
              <div className="sheet-paper-line">Source: {data.sourceType || "pdf"}</div>
              <div className="sheet-paper-block">
                {data.evaluations.length === 0 ? (
                  <div className="muted-text">No evaluation data yet. The answer sheet is attached and ready for review.</div>
                ) : (
                  data.evaluations.map((evaluation) => (
                    <div className="eval-row" key={evaluation.question}>
                      <span>{evaluation.question}</span>
                      <strong>
                        {evaluation.currentMarks}/{evaluation.max}
                      </strong>
                    </div>
                  ))
                )}
              </div>
              <div className="sheet-total">
                <span>Total</span>
                <strong>
                  {data.totals.current}/{data.totals.max}
                </strong>
              </div>
            </div>
          </section>

          <section>
            <div className="panel pad-20">
              <h3 className="section-title compact">Raise a discrepancy</h3>
              {success && <div className="success-banner">{success}</div>}
              <form onSubmit={handleSubmit} className="stack">
                <div className="field">
                  <label htmlFor="question">Question</label>
                  <select id="question" value={question} onChange={(event) => setQuestion(event.target.value)}>
                    {questionOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                {question === "Custom" && (
                  <div className="field">
                    <label htmlFor="customQuestion">Custom question / section</label>
                    <input
                      id="customQuestion"
                      value={customQuestion}
                      onChange={(event) => setCustomQuestion(event.target.value)}
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="message">Message</label>
                  <textarea
                    id="message"
                    rows="5"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Explain the issue clearly."
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit request"}
                </button>
              </form>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

export function StudentRequests({ user, onLogout }) {
  const { data, error } = useResource(() => api.studentComplaints(user.id), [user.id]);
  const pendingComplaints = data?.filter((complaint) => complaint.status === "Pending" || complaint.status === "Under Review") || [];
  const resolvedComplaints = data?.filter((complaint) => complaint.status === "Resolved" || complaint.status === "Rejected") || [];

  return (
    <AppShell role="student" user={user} onLogout={onLogout}>
      <div className="page-header">
        <div>
          <h1>Submitted Complaints</h1>
          <div className="subtitle">Track the complaints you have raised.</div>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && data.length === 0 && <EmptyState>No complaints yet.</EmptyState>}

      {data && data.length > 0 && (
        <>
          <h3 className="section-title">Pending</h3>
          {pendingComplaints.length === 0 ? (
            <EmptyState>No pending complaints.</EmptyState>
          ) : (
            <div className="panel">
              {pendingComplaints.map((request) => (
                <div className="panel-row" key={request.id}>
                  <div className="grow">
                    <div className="title">{request.title}</div>
                    <div className="meta">
                      {request.course?.code} · {request.sheetId} · {request.createdAt}
                    </div>
                    <div className="message-box">{request.description}</div>
                  </div>
                  <StatusPill status={request.status} />
                  <Link className="btn btn-outline" to={`/student/complaints/${request.id}/view`}>
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}

          <h3 className="section-title section-gap">Resolved</h3>
          {resolvedComplaints.length === 0 ? (
            <EmptyState>No resolved complaints yet.</EmptyState>
          ) : (
            <div className="panel">
              {resolvedComplaints.map((request) => (
                <div className="panel-row" key={request.id}>
                  <div className="grow">
                    <div className="title">{request.title}</div>
                    <div className="meta">
                      {request.course?.code} · {request.sheetId} · {request.createdAt}
                    </div>
                    <div className="message-box">{request.description}</div>
                    {request.resolutionComment && <div className="message-box">{request.resolutionComment}</div>}
                  </div>
                  <StatusPill status={request.status} />
                  <Link className="btn btn-outline" to={`/student/complaints/${request.id}/view`}>
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

export function StudentNotifications({ user, onLogout }) {
  const { data, error } = useResource(() => api.studentNotifications(user.id), [user.id]);

  return (
    <AppShell role="student" user={user} onLogout={onLogout}>
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <div className="subtitle">Updates about sheet publishing and discrepancy handling.</div>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && data.length === 0 && <EmptyState>No notifications.</EmptyState>}
      {data && data.length > 0 && (
        <div className="panel">
          {data.map((notification) => (
            <div className="panel-row" key={notification.id}>
              <div className="grow">
                <div className="title">{notification.message}</div>
                <div className="meta">{notification.createdAt}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export function StudentProfile({ user, onLogout }) {
  const { data, error } = useResource(() => api.studentProfile(user.id), [user.id]);

  return (
    <AppShell role="student" user={user} onLogout={onLogout}>
      <div className="page-header">
        <div>
          <h1>Profile</h1>
          <div className="subtitle">Your stored account details.</div>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && (
        <div className="panel pad-20 profile-card">
          <div className="profile-name">{data.name}</div>
          <div className="profile-row"><span>ID</span><strong>{data.id}</strong></div>
          <div className="profile-row"><span>Email</span><strong>{data.email || "-"}</strong></div>
          <div className="profile-row"><span>Programme</span><strong>{data.programme || "-"}</strong></div>
          <div className="profile-row"><span>Semester</span><strong>{data.semester || "-"}</strong></div>
        </div>
      )}
    </AppShell>
  );
}
