import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { PDFViewer } from "@embedpdf/react-pdf-viewer";
import { api } from "../api.js";
import { useResource } from "../hooks.js";
import { AppShell } from "../components/layout.jsx";
import { Loading, StatusPill } from "../components/ui.jsx";

function ViewerFrame({ user, onLogout, sheet, title, allowComplaintSubmit = false }) {
  const location = useLocation();
  const complaintId = new URLSearchParams(location.search).get("complaintId");
  const viewerRef = useRef(null);
  const [viewerRegistry, setViewerRegistry] = useState(null);
  const [complaintContext, setComplaintContext] = useState(null);
  const rawPdfUrl =
    (user.role === "faculty" && complaintContext?.latestPdfUrl) ||
    sheet.latestPdfUrl ||
    sheet.fileUrl ||
    (sheet.fileName ? `/files/generated/pdfs/${sheet.fileName}` : "");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(Boolean(rawPdfUrl));
  const [viewerKey, setViewerKey] = useState(0);
  const [viewerMounted, setViewerMounted] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaintTitle, setComplaintTitle] = useState("");
  const [complaintDescription, setComplaintDescription] = useState("");
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [complaintError, setComplaintError] = useState("");
  const [complaintSuccess, setComplaintSuccess] = useState("");
  const [facultyActionOpen, setFacultyActionOpen] = useState(false);
  const [facultyComment, setFacultyComment] = useState("");

  useEffect(() => {
    if (!complaintId && sheet?.title && sheet?.description) {
      setComplaintContext(sheet);
    }
  }, [complaintId, sheet]);

  useEffect(() => {
    if (!complaintId || user.role !== "faculty") {
      setComplaintContext(null);
      return;
    }
    api.facultyComplaint(user.id, complaintId).then(setComplaintContext).catch(() => setComplaintContext(null));
  }, [complaintId, user.id, user.role]);

  useEffect(() => {
    if (!rawPdfUrl) {
      setPdfUrl("");
      setPdfError("");
      setLoadingPdf(false);
      return;
    }

    let active = true;
    let objectUrl = "";

    async function loadPdf() {
      setLoadingPdf(true);
      setPdfError("");
      try {
        const response = await fetch(rawPdfUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Unable to load PDF (${response.status})`);
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          setPdfUrl(objectUrl);
          setViewerKey((current) => current + 1);
        }
      } catch (error) {
        if (active) {
          setPdfUrl("");
          setPdfError(error.message || "Unable to load PDF");
        }
      } finally {
        if (active) {
          setLoadingPdf(false);
        }
      }
    }

    loadPdf();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [rawPdfUrl]);

  useLayoutEffect(() => {
    if (!pdfUrl) return;

    const triggerResize = () => {
      window.dispatchEvent(new Event("resize"));
    };

    const frameOne = requestAnimationFrame(() => {
      triggerResize();
      requestAnimationFrame(triggerResize);
    });

    return () => {
      cancelAnimationFrame(frameOne);
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!pdfUrl) return;

    const timeout = window.setTimeout(() => {
      const root = document.querySelector(".viewer-shell");
      const buttons = Array.from(root?.querySelectorAll("button") || []);
      const sidebarButton = buttons.find((button) => /sidebar/i.test(button.getAttribute("aria-label") || button.textContent || ""));
      const zoomInButton = buttons.find((button) => /zoom in/i.test(button.getAttribute("aria-label") || button.textContent || ""));
      const zoomOutButton = buttons.find((button) => /zoom out/i.test(button.getAttribute("aria-label") || button.textContent || ""));

      console.debug("[SCBE viewer] post-load buttons", {
        pdfUrl,
        buttonCount: buttons.length,
        sidebar: sidebarButton?.getAttribute("aria-label") || sidebarButton?.textContent || null,
        zoomIn: zoomInButton?.getAttribute("aria-label") || zoomInButton?.textContent || null,
        zoomOut: zoomOutButton?.getAttribute("aria-label") || zoomOutButton?.textContent || null,
      });

      if (sidebarButton) {
        sidebarButton.click();
        window.setTimeout(() => sidebarButton.click(), 100);
      }
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [pdfUrl]);

  useEffect(() => {
    if (!pdfUrl) {
      setViewerMounted(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setViewerMounted(true);
    }, 50);

    return () => window.clearTimeout(timeout);
  }, [pdfUrl]);

  async function handleComplaintSubmit(event) {
    event.preventDefault();
    setComplaintError("");
    setComplaintSuccess("");
    setSubmittingComplaint(true);

    try {
      const title = complaintTitle.trim();
      const description = complaintDescription.trim();
      if (!title || !description) {
        throw new Error("Please add both a title and a description.");
      }
      if (!pdfUrl) {
        throw new Error("No PDF is available to submit.");
      }

      const targetSheetId = sheet?.id || sheet?.sheetId || sheet?.sheetID || "";
      console.debug("[SCBE viewer] complaint submit target", {
        sheetId: targetSheetId,
        sheetKeys: sheet ? Object.keys(sheet) : [],
        currentUrl: window.location.pathname + window.location.search,
      });
      if (!targetSheetId) {
        throw new Error("Missing sheet id.");
      }

      const registry = viewerRegistry || (await viewerRef.current?.registry);
      const annotationCapability = registry?.getCapabilityProvider("annotation");
      const exportCapability = registry?.getCapabilityProvider("export");
      console.debug("[SCBE viewer] complaint submit capabilities", {
        hasRegistry: Boolean(registry),
        annotationMethods: annotationCapability ? Object.keys(annotationCapability) : [],
        exportMethods: exportCapability ? Object.keys(exportCapability) : [],
      });
      if (annotationCapability?.commit) {
        console.debug("[SCBE viewer] committing annotations");
        await annotationCapability.commit();
      }
      const buffer = exportCapability?.saveAsCopy ? await exportCapability.saveAsCopy() : null;
      console.debug("[SCBE viewer] export result", {
        bufferType: buffer?.constructor?.name || null,
        isArrayBuffer: buffer instanceof ArrayBuffer,
        byteLength: buffer?.byteLength ?? buffer?.length ?? null,
      });
      const fileBlob =
        buffer instanceof ArrayBuffer
          ? new Blob([buffer], { type: "application/pdf" })
          : await (await fetch(pdfUrl)).blob();
      const file = new File([fileBlob], `${sheet.fileName || sheet.id}.pdf`, { type: "application/pdf" });
      const formData = new FormData();
      formData.append("title", title);
      formData.append("description", description);
      formData.append("pdf", file);

      if (annotationCapability?.exportAnnotations) {
        const annotations = await annotationCapability.exportAnnotations();
        formData.append("annotationData", JSON.stringify(annotations));
      }

      await api.submitComplaint(user.id, targetSheetId, formData);
      setComplaintSuccess("Complaint submitted and latest PDF saved.");
      setComplaintTitle("");
      setComplaintDescription("");
      setComplaintOpen(false);
      window.location.reload();
    } catch (error) {
      setComplaintError(error.message || "Unable to submit complaint.");
    } finally {
      setSubmittingComplaint(false);
    }
  }

  async function updateComplaint(status) {
    if (!complaintContext) return;
    await api.updateComplaintStatus(user.id, complaintContext.id, status, facultyComment);
    window.location.reload();
  }

  return (
    <AppShell role={user.role} user={user} onLogout={onLogout}>
      <div className="page-header viewer-header">
        <div>
          <h1>{title}</h1>
          <div className="subtitle">
            {sheet.course?.code || "Unassigned"} · {sheet.exam?.title || "No examination"} · {sheet.id}
          </div>
        </div>
        <div className="header-actions">
          <Link className="btn btn-outline" to={`/${user.role}/dashboard`}>
            Dashboard
          </Link>
          <a className="btn btn-primary" href={pdfUrl} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
        </div>
      </div>

      <div className="viewer-shell">
        {complaintContext && (
          <div className="complaint-summary panel pad-20" style={{ margin: 12 }}>
            <div className="title">{complaintContext.title}</div>
            <div className="message-box">{complaintContext.description}</div>
            {complaintContext.resolutionComment && (
              <div className="message-box" style={{ marginTop: 8 }}>
                {complaintContext.resolutionComment}
              </div>
            )}
            <div className="row-actions" style={{ marginTop: 12 }}>
              <StatusPill status={complaintContext.status || "Pending"} />
              {user.role === "faculty" && (
                <>
                  <button className="btn btn-outline" type="button" onClick={() => updateComplaint("Under Review")}>
                    Under review
                  </button>
                  <button className="btn btn-primary" type="button" onClick={() => setFacultyActionOpen(true)}>
                    Resolve
                  </button>
                  <button className="btn btn-outline" type="button" onClick={() => updateComplaint("Resolved")}>
                    Resolve without comment
                  </button>
                  <button className="btn btn-outline" type="button" onClick={() => updateComplaint("Rejected")}>
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        <div className="viewer-toolbar">
          <div className="viewer-toolbar-left">
            <span className="viewer-toolbar-label">View</span>
          </div>
          <div className="viewer-toolbar-right">
            {user.role === "student" && allowComplaintSubmit && (
              <button className="btn btn-outline" onClick={() => setComplaintOpen(true)} type="button">
                Add Complaint
              </button>
            )}
          </div>
        </div>
        {pdfError ? (
          <div className="empty-state">{pdfError}</div>
        ) : loadingPdf ? (
          <Loading />
        ) : pdfUrl && viewerMounted ? (
          <div className="viewer-host">
            <PDFViewer
              ref={viewerRef}
              key={viewerKey}
              config={{
                src: pdfUrl,
                theme: { preference: "system" },
              }}
              className="pdf-viewer"
              style={{ width: "100%", height: "100%" }}
              onReady={async (registry) => {
                setViewerRegistry(registry);
                console.debug("[SCBE viewer] ready", {
                  hasRegistry: Boolean(registry),
                  registryKeys: registry ? Object.keys(registry) : [],
                });
                if (!complaintContext?.annotationData) return;
                const annotationCapability = registry.getCapabilityProvider("annotation");
                try {
                  const annotations = JSON.parse(complaintContext.annotationData || "[]");
                  console.debug("[SCBE viewer] importing annotations", {
                    count: Array.isArray(annotations) ? annotations.length : null,
                  });
                  annotationCapability?.importAnnotations?.(annotations);
                } catch {
                  // ignore malformed stored annotations
                }
              }}
            />
          </div>
        ) : (
          <div className="empty-state">No PDF is attached to this sheet yet.</div>
        )}
      </div>

      {complaintContext && (
        <div className="panel pad-20 complaint-summary">
          <h3 className="section-title compact">{complaintContext.title}</h3>
          <div className="message-box">{complaintContext.description}</div>
        </div>
      )}

      {complaintOpen && user.role === "student" && (
        <div className="modal-backdrop" onClick={() => setComplaintOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Complaint</h3>
              <button className="icon-button" onClick={() => setComplaintOpen(false)} type="button">
                ×
              </button>
            </div>
            <form className="stack" onSubmit={handleComplaintSubmit}>
              <div className="field">
                <label htmlFor="complaintTitle">Title</label>
                <input
                  id="complaintTitle"
                  value={complaintTitle}
                  onChange={(event) => setComplaintTitle(event.target.value)}
                  placeholder="Short summary"
                />
              </div>
              <div className="field">
                <label htmlFor="complaintDescription">Description</label>
                <textarea
                  id="complaintDescription"
                  rows="5"
                  value={complaintDescription}
                  onChange={(event) => setComplaintDescription(event.target.value)}
                  placeholder="Explain the issue and, if needed, add annotations in the PDF viewer before submitting."
                />
              </div>
              {complaintError && <div className="error-text">{complaintError}</div>}
              {complaintSuccess && <div className="success-text">{complaintSuccess}</div>}
              <div className="row-actions">
                <button className="btn btn-primary" type="submit" disabled={submittingComplaint}>
                  {submittingComplaint ? "Submitting…" : "Submit complaint"}
                </button>
                <button className="btn btn-outline" type="button" onClick={() => setComplaintOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {facultyActionOpen && complaintContext && user.role === "faculty" && (
        <div className="modal-backdrop" onClick={() => setFacultyActionOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Resolve complaint</h3>
              <button className="icon-button" onClick={() => setFacultyActionOpen(false)} type="button">
                ×
              </button>
            </div>
            <div className="field">
              <label htmlFor="facultyComment">Comment</label>
              <textarea
                id="facultyComment"
                rows="4"
                value={facultyComment}
                onChange={(event) => setFacultyComment(event.target.value)}
                placeholder="Optional comment for the student"
              />
            </div>
            <div className="row-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={async () => {
                  await updateComplaint("Resolved");
                  setFacultyActionOpen(false);
                }}
              >
                Resolve with comment
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={async () => {
                  await updateComplaint("Resolved");
                  setFacultyActionOpen(false);
                }}
              >
                Resolve without comment
              </button>
              <button className="btn btn-outline" type="button" onClick={() => setFacultyActionOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export function StudentComplaintPage({ user, onLogout }) {
  const { complaintId } = useParams();
  const { data, error } = useResource(() => api.studentComplaint(user.id, complaintId), [user.id, complaintId]);

  if (error) {
    return (
      <AppShell role="student" user={user} onLogout={onLogout}>
        <div className="error-text">{error}</div>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell role="student" user={user} onLogout={onLogout}>
        <Loading />
      </AppShell>
    );
  }

  return <ViewerFrame user={user} onLogout={onLogout} sheet={data} title="Submitted Complaint Viewer" />;
}

export function StudentSheetPage({ user, onLogout }) {
  const { sheetId } = useParams();
  const { data, error } = useResource(() => api.sheet(sheetId, user.id), [sheetId, user.id]);

  if (error) {
    return (
      <AppShell role="student" user={user} onLogout={onLogout}>
        <div className="error-text">{error}</div>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell role="student" user={user} onLogout={onLogout}>
        <Loading />
      </AppShell>
    );
  }

  return (
    <ViewerFrame
      user={user}
      onLogout={onLogout}
      sheet={data}
      title="Answer Sheet Viewer"
      allowComplaintSubmit
    />
  );
}

export function FacultySheetPage({ user, onLogout }) {
  const { sheetId } = useParams();
  const { data, error } = useResource(() => api.sheet(sheetId, user.id), [sheetId, user.id]);

  if (error) {
    return (
      <AppShell role="faculty" user={user} onLogout={onLogout}>
        <div className="error-text">{error}</div>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell role="faculty" user={user} onLogout={onLogout}>
        <Loading />
      </AppShell>
    );
  }

  return <ViewerFrame user={user} onLogout={onLogout} sheet={data} title="Generated PDF Viewer" />;
}
