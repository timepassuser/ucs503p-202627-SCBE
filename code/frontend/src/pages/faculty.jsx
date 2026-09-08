import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useResource } from "../hooks.js";
import { AppShell } from "../components/layout.jsx";
import { EmptyState, Loading, StatCard, StatusPill } from "../components/ui.jsx";

function formatScore(value) {
  return Number(value || 0);
}

export function FacultyDashboard({ user, onLogout }) {
  const { data, error } = useResource(() => api.facultyDashboard(user.id), [user.id]);

  async function resolve(id) {
    try {
      await api.updateDiscrepancy(id, "Resolved");
      window.location.reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <AppShell role="faculty" user={user} onLogout={onLogout}>
      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="page-header">
            <div>
              <h1>Welcome back, {user.name.split(" ").slice(-1)[0]}</h1>
              <div className="subtitle">{user.designation}</div>
            </div>
            <Link className="btn btn-primary" to="/faculty/upload">
              Process a sheet
            </Link>
          </div>

          <div className="stat-grid">
            <StatCard label="Sheets assigned" value={data.stats.sheetsAssigned} />
            <StatCard label="Awaiting verification" value={data.stats.awaitingVerification} />
            <StatCard label="Pending requests" value={data.stats.pendingRequests} tone="warn" />
            <StatCard label="Resolved this month" value={data.stats.resolvedThisMonth} tone="success" />
          </div>

          <h3 className="section-title">Pending discrepancy requests</h3>
          {data.pendingDiscrepancies.length === 0 ? (
            <EmptyState>No pending requests.</EmptyState>
          ) : (
            <div className="panel">
              {data.pendingDiscrepancies.slice(0, 6).map((item) => (
                <div className="panel-row" key={item.id}>
                  <div className="grow">
                    <div className="title">
                      {item.studentName} - {item.question}
                    </div>
                    <div className="meta">
                      {item.course?.code} · Booklet {item.sheetId} · Submitted {item.createdAt}
                    </div>
                  </div>
                  <StatusPill status={item.status} />
                  <button className="btn btn-outline" onClick={() => resolve(item.id)}>
                    Mark resolved
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

export function FacultySheets({ user, onLogout }) {
  const { data, error } = useResource(() => api.facultySheets(user.id), [user.id]);
  const { data: unassigned, error: unassignedError } = useResource(
    () => api.facultyUnassignedSheets(user.id),
    [user.id]
  );
  const { data: users } = useResource(() => api.users(), []);
  const students = useMemo(() => (users || []).filter((member) => member.role === "student"), [users]);
  const [assignmentTargets, setAssignmentTargets] = useState({});

  async function publish(sheetId) {
    try {
      await api.publishSheet(sheetId);
      window.location.reload();
    } catch (err) {
      alert(err.message);
    }
  }

  async function assignExistingSheet(sheet) {
    const selectedStudentId = assignmentTargets[sheet.id];
    if (!selectedStudentId) {
      alert("Choose a student first.");
      return;
    }
    try {
      await api.assignSheet(user.id, {
        sheetId: sheet.id,
        studentId: selectedStudentId,
        examId: sheet.examId || "",
        fileName: sheet.fileName,
        pdfName: sheet.fileName,
        pdfUrl: sheet.fileUrl,
        sourceType: sheet.sourceType || "pdf",
      });
      window.location.reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <AppShell role="faculty" user={user} onLogout={onLogout}>
      <div className="page-header">
        <div>
          <h1>Assigned Answer Sheets</h1>
          <div className="subtitle">All sheets currently tracked by the evaluation workflow.</div>
        </div>
        <Link className="btn btn-primary" to="/faculty/upload">
          Upload / Process
        </Link>
      </div>

      {error && <div className="error-text">{error}</div>}
      {unassignedError && <div className="error-text">{unassignedError}</div>}
      {!data && !error && <Loading />}
      {unassigned && (
        <>
          <h3 className="section-title">Unassigned sheets</h3>
          {unassigned.length === 0 ? (
            <EmptyState>No unassigned sheets right now.</EmptyState>
          ) : (
            <div className="panel">
              {unassigned.map((sheet) => (
                <div className="panel-row" key={sheet.id}>
                  <div className="grow">
                    <div className="title">{sheet.fileName || sheet.id}</div>
                    <div className="meta">
                      {sheet.createdAt} · {sheet.sourceType || "pdf"} · {sheet.fileUrl || "No file"}
                    </div>
                  </div>
                  <div className="field" style={{ minWidth: 240, marginBottom: 0 }}>
                    <select
                      value={assignmentTargets[sheet.id] || ""}
                      onChange={(event) =>
                        setAssignmentTargets((current) => ({ ...current, [sheet.id]: event.target.value }))
                      }
                    >
                      <option value="">Select a student…</option>
                      {students.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.id} - {student.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-primary" onClick={() => assignExistingSheet(sheet)}>
                    Assign
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {data && data.length === 0 && <EmptyState>No sheets yet.</EmptyState>}
      {data && data.length > 0 && (
        <div className="panel">
          {data.map((sheet) => (
            <div className="panel-row" key={sheet.id}>
              <div className="grow">
                <div className="title">
                  {sheet.course?.code} · {sheet.course?.title}
                </div>
                <div className="meta">
                  {sheet.studentName || "Unknown student"} · {sheet.exam?.session} · {sheet.id}
                </div>
              </div>
              <div className="score-block">
                <div className="score">{formatScore(sheet.totals.current)}/{formatScore(sheet.totals.max)}</div>
                <div className="meta">{sheet.published ? "Published" : "Draft"}</div>
              </div>
              {sheet.fileUrl && (
                <Link className="btn btn-outline" to={`/faculty/sheets/${sheet.id}/view`}>
                  Open viewer
                </Link>
              )}
              {!sheet.published && (
                <button className="btn btn-primary" onClick={() => publish(sheet.id)}>
                  Publish
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export function FacultyUpload({ user, onLogout }) {
  const { data: exams } = useResource(() => api.exams(), []);
  const { data: users } = useResource(() => api.users(), []);
  const students = useMemo(() => (users || []).filter((member) => member.role === "student"), [users]);

  const [mode, setMode] = useState("video");
  const [videoFile, setVideoFile] = useState(null);
  const [imageFiles, setImageFiles] = useState([]);
  const [modifyPdfFile, setModifyPdfFile] = useState(null);
  const [modifyImageFile, setModifyImageFile] = useState(null);
  const [sourcePdfName, setSourcePdfName] = useState("");
  const [operation, setOperation] = useState("delete_page");
  const [pageNumber, setPageNumber] = useState("1");
  const [outputName, setOutputName] = useState("");
  const [examId, setExamId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [name, setName] = useState("");
  const [processResult, setProcessResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!studentId && students.length > 0) {
      setStudentId(students[0].id);
    }
  }, [students, studentId]);

  async function handleProcess(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const formData = new FormData();
      if (outputName) formData.append("output_name", outputName);

      if (mode === "video") {
        if (!videoFile) throw new Error("Choose a video file first.");
        formData.append("video", videoFile);
        const result = await api.processVideo(user.id, formData);
        setProcessResult(result);
        setSuccess(`Generated ${result.pdf_name}.`);
      } else if (mode === "images") {
        if (imageFiles.length === 0) throw new Error("Choose at least one image.");
        imageFiles.forEach((file) => formData.append("images", file));
        const result = await api.processImages(user.id, formData);
        setProcessResult(result);
        setSuccess(`Generated ${result.pdf_name}.`);
      } else {
        formData.append("operation", operation);
        if (sourcePdfName) formData.append("source_pdf_name", sourcePdfName);
        if (pageNumber) formData.append("page_number", pageNumber);
        if (modifyPdfFile) formData.append("pdf", modifyPdfFile);
        if (modifyImageFile) formData.append("image", modifyImageFile);
        const result = await api.modifyPdf(user.id, formData);
        setProcessResult(result);
        setSuccess(`Created ${result.output_pdf}.`);
      }
    } catch (err) {
      setError(err.message);
      setProcessResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(event) {
    event.preventDefault();
    if (!processResult) return;
    setError("");
    setSuccess("");
    setAssigning(true);
    try {
      const pdfName = processResult.pdf_name || processResult.output_pdf;
      const pdfUrl = processResult.pdfUrl || `/files/generated/pdfs/${pdfName}`;
      const created = await api.assignSheet(user.id, {
        sheetId: processResult.sheetId,
        fileName: pdfName,
        pdfName,
        pdfUrl,
        examId: examId || "",
        studentId,
        rollNumber,
        name,
        sourceType: mode,
        pagesExtracted: processResult.pages_extracted || processResult.image_count || 0,
      });
      setSuccess(`Assigned ${created.id} to ${created.studentName}.`);
      setProcessResult(null);
      setExamId("");
      setRollNumber("");
      setName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
  }

  const processedPdfName = processResult?.pdf_name || processResult?.output_pdf;
  const processedPdfUrl = processResult?.pdfUrl || (processedPdfName ? `/files/generated/pdfs/${processedPdfName}` : "");

  return (
    <AppShell role="faculty" user={user} onLogout={onLogout}>
      <div className="page-header">
        <div>
          <h1>Upload / Process</h1>
          <div className="subtitle">Send media to the CV backend, then assign the resulting PDF.</div>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      {!exams && <Loading />}

      {exams && (
        <div className="two-col upload-layout">
          <section className="panel pad-20">
            <div className="segmented">
              <button className={`segment ${mode === "video" ? "active" : ""}`} onClick={() => setMode("video")} type="button">
                Video
              </button>
              <button className={`segment ${mode === "images" ? "active" : ""}`} onClick={() => setMode("images")} type="button">
                Images
              </button>
              <button className={`segment ${mode === "modify" ? "active" : ""}`} onClick={() => setMode("modify")} type="button">
                Modify PDF
              </button>
            </div>

            <form onSubmit={handleProcess} className="stack">
              {mode === "video" && (
                <div className="field">
                  <label htmlFor="video-file">Video file</label>
                  <input id="video-file" type="file" accept="video/*" onChange={(event) => setVideoFile(event.target.files?.[0] || null)} />
                </div>
              )}

              {mode === "images" && (
                <div className="field">
                  <label htmlFor="image-files">Image files</label>
                  <input
                    id="image-files"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => setImageFiles(Array.from(event.target.files || []))}
                  />
                </div>
              )}

              {mode === "modify" && (
                <>
                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor="operation">Operation</label>
                      <select id="operation" value={operation} onChange={(event) => setOperation(event.target.value)}>
                        <option value="delete_page">Delete page</option>
                        <option value="add_page">Add page</option>
                        <option value="replace_page">Replace page</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="pageNumber">Page number</label>
                      <input id="pageNumber" type="number" min="1" value={pageNumber} onChange={(event) => setPageNumber(event.target.value)} />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="sourcePdfName">Existing PDF name</label>
                    <input
                      id="sourcePdfName"
                      placeholder="answer_sheet_1.pdf"
                      value={sourcePdfName}
                      onChange={(event) => setSourcePdfName(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="modifyPdfFile">Upload source PDF instead</label>
                    <input id="modifyPdfFile" type="file" accept="application/pdf" onChange={(event) => setModifyPdfFile(event.target.files?.[0] || null)} />
                  </div>
                  <div className="field">
                    <label htmlFor="modifyImageFile">Replacement / inserted image</label>
                    <input id="modifyImageFile" type="file" accept="image/*" onChange={(event) => setModifyImageFile(event.target.files?.[0] || null)} />
                  </div>
                </>
              )}

              <div className="field">
                <label htmlFor="outputName">Output PDF name</label>
                <input id="outputName" placeholder="answer_sheet_1.pdf" value={outputName} onChange={(event) => setOutputName(event.target.value)} />
              </div>

              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Processing…" : "Run CV pipeline"}
              </button>
            </form>
          </section>

          <section className="stack">
            <div className="panel pad-20">
              <h3 className="section-title compact">Result</h3>
              {!processResult ? (
                <EmptyState>No output yet.</EmptyState>
              ) : (
                <div className="stack">
                  <div className="result-box">
                    <div className="title">{processedPdfName}</div>
                    <div className="meta">{processedPdfUrl}</div>
                  </div>
                  {"pages_extracted" in processResult && (
                    <div className="meta">Pages extracted: {processResult.pages_extracted}</div>
                  )}
                  {"image_count" in processResult && (
                    <div className="meta">Images stitched: {processResult.image_count}</div>
                  )}
                  {"original_page_count" in processResult && (
                    <div className="meta">
                      Pages: {processResult.original_page_count} → {processResult.updated_page_count}
                    </div>
                  )}
                  {processedPdfUrl && (
                    <a className="btn btn-outline" href={processedPdfUrl} target="_blank" rel="noreferrer">
                      Open generated PDF
                    </a>
                  )}
                </div>
              )}
            </div>

            {mode !== "modify" && processResult && (
              <div className="panel pad-20">
                <h3 className="section-title compact">Assign generated sheet</h3>
                <form onSubmit={handleAssign} className="stack">
                  {exams.length > 0 ? (
                    <div className="field">
                      <label htmlFor="examId">Examination</label>
                      <select id="examId" value={examId} onChange={(event) => setExamId(event.target.value)}>
                        <option value="">Select an examination…</option>
                        {exams.map((exam) => (
                          <option key={exam.id} value={exam.id}>
                            {exam.course?.code} - {exam.title} ({exam.session})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="hint-box">No examinations are configured yet. This sheet will be saved without one.</div>
                  )}
                  <div className="field">
                    <label htmlFor="studentId">Student</label>
                    {students.length > 0 ? (
                      <select id="studentId" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
                        <option value="">Select a student…</option>
                        {students.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.id} - {student.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value="No student accounts yet" disabled />
                    )}
                  </div>
                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor="rollNumber">Roll number</label>
                      <input id="rollNumber" value={rollNumber} onChange={(event) => setRollNumber(event.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="name">Student name</label>
                      <input id="name" value={name} onChange={(event) => setName(event.target.value)} />
                    </div>
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={assigning}>
                    {assigning ? "Assigning…" : "Assign to student"}
                  </button>
                </form>
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

export function FacultyComplaints({ user, onLogout }) {
  const { data, error } = useResource(() => api.facultyComplaints(user.id), [user.id]);
  const pendingCount = data ? data.filter((item) => item.status === "Pending" || item.status === "Under Review").length : 0;
  const resolvedCount = data ? data.filter((item) => item.status === "Resolved").length : 0;
  const [activeComplaint, setActiveComplaint] = useState(null);
  const [resolveComment, setResolveComment] = useState("");
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [viewFilter, setViewFilter] = useState("pending");

  async function changeStatus(id, status) {
    try {
      await api.updateComplaintStatus(user.id, id, status);
      window.location.reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <AppShell role="faculty" user={user} onLogout={onLogout}>
      <div className="page-header">
        <div>
          <h1>Student Complaints</h1>
          <div className="subtitle">Track and triage requests raised against answer sheets.</div>
        </div>
      </div>

      {data && (
        <div className="stat-grid" style={{ marginBottom: 18 }}>
          <StatCard label="Pending complaints" value={pendingCount} tone="warn" />
          <StatCard label="Resolved complaints" value={resolvedCount} tone="success" />
        </div>
      )}

      <div className="segmented" style={{ marginBottom: 18 }}>
        <button className={`segment ${viewFilter === "pending" ? "active" : ""}`} type="button" onClick={() => setViewFilter("pending")}>
          Pending
        </button>
        <button className={`segment ${viewFilter === "resolved" ? "active" : ""}`} type="button" onClick={() => setViewFilter("resolved")}>
          Resolved
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && data.length === 0 && <EmptyState>No complaints yet.</EmptyState>}
      {data && data.filter((item) => (viewFilter === "pending" ? item.status !== "Resolved" : item.status === "Resolved")).length === 0 && (
        <EmptyState>No complaints in this view.</EmptyState>
      )}
      {data && data.length > 0 && (
        <div className="panel">
          {data
            .filter((item) => (viewFilter === "pending" ? item.status !== "Resolved" : item.status === "Resolved"))
            .map((item) => (
            <div className="panel-row" key={item.id}>
              <div className="grow">
                <div className="title">
                  {item.title} · {item.studentName || "Unknown student"}
                </div>
                <div className="meta">
                  {item.course?.code} · {item.studentEmail || "-"} · {item.createdAt}
                </div>
                <div className="message-box">{item.description}</div>
              </div>
              <StatusPill status={item.status || "Pending"} />
              <div className="row-actions">
                {item.latestPdfUrl && (
                  <Link className="btn btn-outline" to={`/faculty/sheets/${item.sheetId}/view?complaintId=${item.id}`}>
                    Review PDF
                  </Link>
                )}
                {item.status !== "Under Review" && (
                  <button className="btn btn-outline" onClick={() => changeStatus(item.id, "Under Review")}>
                    Under review
                  </button>
                )}
                {item.status !== "Resolved" && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setActiveComplaint(item);
                      setResolveComment("");
                      setResolveModalOpen(true);
                    }}
                  >
                    Resolve
                  </button>
                )}
                {item.status !== "Resolved" && (
                  <button className="btn btn-outline" onClick={() => changeStatus(item.id, "Resolved")}>
                    Resolve without comment
                  </button>
                )}
                {item.status !== "Rejected" && (
                  <button className="btn btn-outline" onClick={() => changeStatus(item.id, "Rejected")}>
                    Reject
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {resolveModalOpen && activeComplaint && (
        <div className="modal-backdrop" onClick={() => setResolveModalOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Resolve complaint</h3>
              <button className="icon-button" type="button" onClick={() => setResolveModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="message-box" style={{ marginBottom: 12 }}>
              {activeComplaint.title}
            </div>
            <div className="field">
              <label htmlFor="resolveComment">Comment</label>
              <textarea
                id="resolveComment"
                rows="4"
                value={resolveComment}
                onChange={(event) => setResolveComment(event.target.value)}
                placeholder="Add a resolution note for the student"
              />
            </div>
            <div className="row-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={async () => {
                  await api.updateComplaintStatus(user.id, activeComplaint.id, "Resolved", resolveComment);
                  setResolveModalOpen(false);
                  window.location.reload();
                }}
              >
                Resolve with comment
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={async () => {
                  await api.updateComplaintStatus(user.id, activeComplaint.id, "Resolved");
                  setResolveModalOpen(false);
                  window.location.reload();
                }}
              >
                Resolve without comment
              </button>
              <button className="btn btn-outline" type="button" onClick={() => setResolveModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export function FacultyHistory({ user, onLogout }) {
  const { data, error } = useResource(() => api.facultyHistory(user.id), [user.id]);

  return (
    <AppShell role="faculty" user={user} onLogout={onLogout}>
      <div className="page-header">
        <div>
          <h1>Review History</h1>
          <div className="subtitle">Closed requests and resolved review notes.</div>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}
      {!data && !error && <Loading />}
      {data && data.length === 0 && <EmptyState>No resolved requests yet.</EmptyState>}
      {data && data.length > 0 && (
        <div className="panel">
          {data.map((item) => (
            <div className="panel-row" key={item.id}>
              <div className="grow">
                <div className="title">{item.studentName} · {item.question}</div>
                <div className="meta">
                  {item.course?.code} · {item.createdAt}
                </div>
              </div>
              <StatusPill status={item.status} />
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
