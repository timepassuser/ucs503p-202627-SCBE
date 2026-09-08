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
  const viewerHostRef = useRef(null);
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
    if (!pdfUrl || !viewerMounted) return;

    // EmbedPDF's page canvases are painted based on the visible/tiled range
    // it computes from a ResizeObserver on its internal scroll container.
    // That observer only reacts to a genuine change in the observed
    // element's box size — dispatching a synthetic window "resize" event
    // (the old approach) does nothing, because nothing is actually
    // listening for that event. This matches what's observed manually:
    // zooming or toggling the sidebar both change the size of the space
    // available to the viewer, which is what actually triggers the
    // repaint. We reproduce that here by nudging the width of the host
    // element we control (which the EmbedPDF container fills at 100%),
    // forcing a real, measurable resize the observer will pick up. As a
    // second, independent trigger we also nudge the scroll position of
    // EmbedPDF's own internal scroll container (reached through its open
    // shadow root), since some virtualization passes are keyed off scroll
    // position rather than size.
    let cancelled = false;
    let retryTimer = null;
    let fallbackTimer = null;

    const findScrollableDescendant = (root) => {
      if (!root) return null;
      const candidates = root.querySelectorAll("*");
      for (const element of candidates) {
        if (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) {
          return element;
        }
      }
      return null;
    };

    const nudge = () => {
      const host = viewerHostRef.current;
      if (!host || cancelled) return false;

      const original = host.style.width;
      host.style.width = "calc(100% - 1px)";
      // Reading a layout property forces the browser to flush layout
      // synchronously, so the shrink above is observed as a real resize
      // before we immediately restore the original width on the next frame.
      // eslint-disable-next-line no-unused-expressions
      host.offsetWidth;
      requestAnimationFrame(() => {
        if (cancelled) return;
        host.style.width = original;
      });

      const embedElement = viewerRef.current?.container;
      const scrollable = embedElement?.shadowRoot ? findScrollableDescendant(embedElement.shadowRoot) : null;
      if (scrollable) {
        const originalScrollTop = scrollable.scrollTop;
        scrollable.scrollTop = originalScrollTop + 1;
        requestAnimationFrame(() => {
          if (cancelled) return;
          scrollable.scrollTop = originalScrollTop;
        });
      }

      return true;
    };

    // The EmbedPDF web component attaches asynchronously after our host div
    // mounts, so the very first attempt can still find `viewerHostRef` empty
    // of the internal scrollable element. Retry a few times over the first
    // half-second rather than guessing a single "safe" delay.
    let attempts = 0;
    const attemptNudge = () => {
      if (cancelled) return;
      nudge();
      attempts += 1;
      if (attempts < 6) {
        retryTimer = window.setTimeout(attemptNudge, 100);
      }
    };
    fallbackTimer = window.setTimeout(attemptNudge, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [pdfUrl, viewerKey, viewerMounted]);

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
      if (!targetSheetId) {
        throw new Error("Missing sheet id.");
      }

      const registry = viewerRegistry || (await viewerRef.current?.registry);
      // getCapabilityProvider() returns the underlying plugin instance, not
      // the capability object itself — the plugin's own `.provides()` method
      // is what exposes the callable capability API (commit, saveAsCopy,
      // exportAnnotations, etc). Calling methods directly off the plugin
      // instance (as this used to) silently no-ops, which is why annotations
      // were never actually committed/exported before.
      const annotationCapability = registry?.getCapabilityProvider("annotation")?.provides();
      const exportCapability = registry?.getCapabilityProvider("export")?.provides();

      if (!registry) {
        console.warn("[SCBE] PDF viewer registry was not ready when the complaint form was submitted.");
      }
      if (!annotationCapability) {
        console.warn("[SCBE] annotation capability unavailable — annotations will not be saved.");
      }
      if (!exportCapability) {
        console.warn("[SCBE] export capability unavailable — falling back to the unedited PDF.");
      }

      if (annotationCapability?.commit) {
        try {
          // commit() returns an EmbedPDF Task, not a native Promise, so it
          // has to be converted with .toPromise() before awaiting —
          // awaiting the Task object directly resolves immediately without
          // waiting for the commit to finish.
          await annotationCapability.commit().toPromise();
        } catch (commitError) {
          // A failed/empty commit shouldn't block submission entirely —
          // there may simply be nothing pending to commit — but log it so
          // it's visible while debugging.
          console.warn("[SCBE] annotation commit failed or had nothing to commit:", commitError);
        }
      }

      let buffer = null;
      if (exportCapability?.saveAsCopy) {
        try {
          buffer = await exportCapability.saveAsCopy().toPromise();
        } catch (exportError) {
          console.warn("[SCBE] saveAsCopy failed, falling back to the loaded PDF:", exportError);
        }
      }

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
        try {
          const annotations = await annotationCapability.exportAnnotations().toPromise();
          formData.append("annotationData", JSON.stringify(annotations));
        } catch (annotationExportError) {
          console.warn("[SCBE] exportAnnotations failed:", annotationExportError);
        }
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
          <div className="viewer-host" ref={viewerHostRef}>
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
                if (!complaintContext?.annotationData) return;
                const annotationCapability = registry.getCapabilityProvider("annotation")?.provides();
                try {
                  const annotations = JSON.parse(complaintContext.annotationData || "[]");
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
