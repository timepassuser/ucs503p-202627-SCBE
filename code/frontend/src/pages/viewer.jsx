import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { PDFViewer, ZoomMode, PdfAnnotationSubtype } from "@embedpdf/react-pdf-viewer";
import { api } from "../api.js";
import { useResource } from "../hooks.js";
import { AppShell } from "../components/layout.jsx";
import { Loading, StatusPill } from "../components/ui.jsx";

// SCBE's marking feature uses a dedicated EmbedPDF stamp tool. The marker is
// a small PNG so it is rendered consistently in the viewer and exported PDF.
const SCBE_MARK_TOOL_ID = "scbe-evaluation-marker";
const SCBE_MARK_SUBJECT_PREFIX = "SCBE_EVALUATION:";
const SCBE_MARKER_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAFoUlEQVR4nO2dXWsdRRjHn305byFUEyvWqmADKhX7IlVLK7E9qaCEgiBSq41eeSH0G3jrd/DKqya1UtobcyFFktAaoRVbBUPFUqTW3tREJIHkvO2e8eKweHLYmZ3ZnZl9Zs/8bk92Z/b/f55nZnY3OwAWi8VisVhywcm7A7wQQojoMY7joL8+lB1MIzYv2ExB0xmVotPAYEbuHchD+EHyNCKXhjGITkO3GVobyyL885+sbYkec+fLnSNp29NlhDYDRMVPI3gSooboMEF5AyLCqxCdhogZKo1QagCP+DpFp8FjhioTlBmQJD4G4QdJMkKFCdJPaErU09CdDVINMDHqaejKBlfGSQCKJT5Acn9lrWWkuMjqjGnCx8HKhqyZkDkDii4+APs6smZCJgOGQfwIVSZIGwP6KZr4ESquK7UBNNeLKn4E7frSZkEqA4ZV/AiZJggbMOziR8gyQckYYOFHyAAb/duRkQXci4is4h+c8N2Lnz1a5W0PAODzC5vt2YVGIHLMIF+c3VF58+Wyx/v3jRaBA2f/EQoo2kKNZ5GGugSdqVf9LOvM3eOuUz/AL34ecBmQV+mZ2OW5R/aWUgv4Qb3mexpCLEspSt09XXV/Zqrmpzmu7DtwarKS6tg0pNUDdQkCAKjvL3u7x13hQnTycMUfGxU/TjeJBsSlkc5Zj+f2SonocTP1qrboj4jTJakMoc8AAIBTkxW/7PMH88EJ333pWd+Ia2N2EssLVGOjrjP9Wpk7oj86kW7cUAVLR+EoyWvRNcNZhnbucJ23D+kbfAcR1ceINAUA2L/Hd/dxlJX336j6JVTxz4Z6QXmVn9X1LrXdpCmp5wKcPkYffFnnVg1NT6EM0FF+vr7apN56mH61zJxavnWo4j0xRv+ddW6ZiOiErgRdWm4GzXZ8oFZK7MXVzFS1RPvtlz+C7sq9oCuhi1JBZ8D6JiHzN1rUSD19vObHxfgLT/vuK8+VqNczt5jtpp4q0BkAADC3SC8VTz3mOlMxN9g+PkGv/WsbXfLtT3RT8yTWgLxXv7/9FXRv3e1Qy8WZgcH4kRHHOXmYXpouXmsGHc3y866KUWYAAMDsYrND++3o3pK3Z9f/9znfm6z6tXL82Bt2AS5oGnzTgNaAKzdbIW3a6Di9ZwUAAK4D8OFxevn57udW+PDf/KafSaA1IAjZ08Z3j1a9kYoDx/aVvWce96hTzzlGJmEArQEAPQOCMP630ZrjvHOk4rPu+9x5EHR//J0+lmAAtQGr611y5WaLYgHAp9MjpddfpD8xm2XMprCA2gAA9mD85LhLfey9sUXIN9dxTj37QW/Arbud7u374ivYyz80wwZlRY0J9AYAAJxfEislhAB8tYR78I0wwoD5G61gfZP/7uz3K+3wz79D/OEPhhjQbBO4tMyfBSYMvhFGGADQK0M8y6n7qyG5ttKmzpywYYwBD9ZCcvXXZGHPLzU7OJ5k8xFrQNw7jVk+fCGLuQV2aWm0CVxebqKI/ji94nQ1JgMAAJZvt8N7D+mD6/z1VrCxZVL8G2YAIex7OyYNvhEGvT/Q49xCIziX8ZV1TAhlAIZxwAREdKIagOGDdkWCpqdRY0ARETbAliE2ovowDbBlSA4sHW0JyhmuCM/7NRVT4F399mMzIGdSG2AH4+2k1YPLAFoaWRN6FPYftYcBbgNsFsSTJfoBBDPAmrCdrOID2BKUO8IG2CzoISP6AVJmwLCbIEt8gAwlaFhNkCk+gKIxoKgmqLiuTAawXC+aCao+X5w5A4bBBJXfjpZ2v79oX08H0PMJe2ljQFJnTMsGXfsH2B00BjB6B41+TCxJhdhDph9TsqGQuyhF2H3EEs6t6sSD2J30KG2obqAfu5dkTDs6GhkEy8cA4yj0bqpxYDBj6PYTjsPuqI0Iu6c8QtKYgk1si8VisVj6+Q+2UpoWP85wOgAAAABJRU5ErkJggg==";
// Keep the original circular M stamp as the visual marker. The question and
// score are added as a separate, ordinary PDF FreeText annotation beside it.
const SCBE_MARK_LABEL_SUBJECT_PREFIX = "SCBE_EVALUATION_LABEL:";

function createScbeAnnotationId() {
  // EmbedPDF expects UUIDs for explicitly supplied annotation IDs. Keep a
  // standards-compliant fallback for browsers without crypto.randomUUID().
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getScbeQuestionLabel(mark) {
  return `Q${mark.questionNo}${
    mark.part ? `(${mark.part})` : ""
  }${mark.subpart ? `(${mark.subpart})` : ""}`;
}

function getScbeMarkLabelRect(markerRect, labelText) {
  const labelHeight = 18;
  // Approximate text width in PDF points. Keep a sensible minimum and maximum
  // so short labels do not look oversized and long labels remain readable.
  const labelWidth = Math.min(150, Math.max(78, labelText.length * 5.8 + 8));

  return {
    origin: {
      // Place the text just to the right of the M stamp and vertically center it.
      x: markerRect.origin.x + markerRect.size.width + 5,
      y:
        markerRect.origin.y +
        Math.max(0, (markerRect.size.height - labelHeight) / 2),
    },
    size: { width: 100, height: 100 },
  };
}

function createScbeMarkLabelAnnotation(
  mark,
  pageIndex,
  markerRect,
  annotationId,
  freeTextDefaults = {},
) {
  const questionLabel = getScbeQuestionLabel(mark);
  const labelText = `${questionLabel}: ${mark.marksObtained}/${mark.totalMarks}`;

  return {
    id: annotationId,
    type: PdfAnnotationSubtype.FREETEXT,
    pageIndex,
    rect: getScbeMarkLabelRect(markerRect, labelText),
    contents: labelText,
    fontSize: 25,
    fontColor: "#ff0000",
    // Reuse the installed FreeText tool's enum values rather than assuming
    // whether this EmbedPDF version represents them as strings or numbers.
    fontFamily: freeTextDefaults.fontFamily,
    textAlign: freeTextDefaults.textAlign,
    opacity: 1,
    // A separate subject identifies this as the companion label, not a mark.
    subject: `${SCBE_MARK_LABEL_SUBJECT_PREFIX}${mark.markerId}`,
    custom: { scbeEvaluationLabelFor: mark.markerId },
  };
}

// Evaluation metadata is stored in the standard PDF annotation subject field.
// This keeps it attached to the marker when the PDF is saved/reopened. The
// custom field is also populated for consumers of EmbedPDF's annotation export.
function readScbeEvaluationMark(annotation) {
  if (!annotation) return null;

  let metadata = null;
  const subject = annotation.subject || "";

  if (subject.startsWith(SCBE_MARK_SUBJECT_PREFIX)) {
    try {
      metadata = JSON.parse(subject.slice(SCBE_MARK_SUBJECT_PREFIX.length));
    } catch (error) {
      console.warn("[SCBE] Invalid evaluation marker metadata:", error);
    }
  }

  metadata ||= annotation.custom?.scbeEvaluation;

  if (!metadata?.markerId) return null;

  return {
    ...metadata,
    annotationId: annotation.id,
    pageIndex: annotation.pageIndex,
    rect: annotation.rect,
  };
}

function readScbeEvaluationMarks(transferItems) {
  return (transferItems || [])
    .map((item) => readScbeEvaluationMark(item.annotation))
    .filter(Boolean);
}

function ViewerFrame({
  user,
  onLogout,
  sheet,
  title,
  allowComplaintSubmit = false,
  allowEvaluationSave = false,
}) {
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
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaintTitle, setComplaintTitle] = useState("");
  const [complaintDescription, setComplaintDescription] = useState("");
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [complaintError, setComplaintError] = useState("");
  const [complaintSuccess, setComplaintSuccess] = useState("");
  const [facultyActionOpen, setFacultyActionOpen] = useState(false);
  const [facultyComment, setFacultyComment] = useState("");
  const [savingEvaluation, setSavingEvaluation] = useState(false);
  const [evaluationMessage, setEvaluationMessage] = useState("");
  const [evaluationError, setEvaluationError] = useState("");
  const [markDialogOpen, setMarkDialogOpen] = useState(false);
  const [markQuestionNo, setMarkQuestionNo] = useState("");
  const [markPart, setMarkPart] = useState("");
  const [markSubpart, setMarkSubpart] = useState("");
  const [markObtained, setMarkObtained] = useState("");
  const [markTotal, setMarkTotal] = useState("");
  const [markError, setMarkError] = useState("");
  const [markStatus, setMarkStatus] = useState("");
  const [evaluationMarks, setEvaluationMarks] = useState([]);
  const annotationCapabilityRef = useRef(null);
  const annotationEventUnsubscribeRef = useRef(null);
  const pendingMarkRef = useRef(null);
  // EmbedPDF may report more than one create event for the same annotation
  // (for example, while it transitions from an uncommitted to committed state).
  // Track stamp IDs synchronously so duplicate events cannot create duplicate
  // companion FreeText labels.
  const processedMarkerIdsRef = useRef(new Set());

  // EmbedPDF's event subscription returns an unsubscribe function. Keep only
  // one listener per viewer instance and release it when this component exits.
  useEffect(() => () => {
    annotationEventUnsubscribeRef.current?.();
    annotationEventUnsubscribeRef.current = null;
    processedMarkerIdsRef.current.clear();
  }, []);

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
    api
      .facultyComplaint(user.id, complaintId)
      .then(setComplaintContext)
      .catch(() => setComplaintContext(null));
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
      // The drop-in PDFViewer already registers its annotation and export
      // plugins. Use the documented registry API to access their capabilities.
      const annotationCapability = registry
        ?.getPlugin("annotation")
        ?.provides();
      const exportCapability = registry?.getPlugin("export")?.provides();

      if (!registry) {
        console.warn(
          "[SCBE] PDF viewer registry was not ready when the complaint form was submitted.",
        );
      }
      if (!annotationCapability) {
        console.warn(
          "[SCBE] annotation capability unavailable — annotations will not be saved.",
        );
      }
      if (!exportCapability) {
        console.warn(
          "[SCBE] export capability unavailable — falling back to the unedited PDF.",
        );
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
          console.warn(
            "[SCBE] annotation commit failed or had nothing to commit:",
            commitError,
          );
        }
      }

      let buffer = null;
      if (exportCapability?.saveAsCopy) {
        try {
          buffer = await exportCapability.saveAsCopy().toPromise();
        } catch (exportError) {
          console.warn(
            "[SCBE] saveAsCopy failed, falling back to the loaded PDF:",
            exportError,
          );
        }
      }

      const fileBlob =
        buffer instanceof ArrayBuffer
          ? new Blob([buffer], { type: "application/pdf" })
          : await (await fetch(pdfUrl)).blob();
      const file = new File([fileBlob], `${sheet.fileName || sheet.id}.pdf`, {
        type: "application/pdf",
      });
      const formData = new FormData();
      formData.append("title", title);
      formData.append("description", description);
      formData.append("pdf", file);

      if (annotationCapability?.exportAnnotations) {
        try {
          const annotations = await annotationCapability
            .exportAnnotations()
            .toPromise();
          formData.append("annotationData", JSON.stringify(annotations));
        } catch (annotationExportError) {
          console.warn(
            "[SCBE] exportAnnotations failed:",
            annotationExportError,
          );
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
    await api.updateComplaintStatus(
      user.id,
      complaintContext.id,
      status,
      facultyComment,
    );
    window.location.reload();
  }

  async function saveEvaluation() {
    setEvaluationError("");
    setEvaluationMessage("");
    setSavingEvaluation(true);

    try {
      if (pendingMarkRef.current) {
        throw new Error("Place the pending marker or cancel marker placement before saving.");
      }

      const registry = viewerRegistry || (await viewerRef.current?.registry);
      const annotationCapability = registry?.getPlugin("annotation")?.provides();
      const exportCapability = registry?.getPlugin("export")?.provides();

      if (!exportCapability?.saveAsCopy) {
        throw new Error("The PDF export tool is not ready yet. Please wait a moment and try again.");
      }

      if (annotationCapability?.commit) {
        try {
          await annotationCapability.commit().toPromise();
        } catch (commitError) {
          console.warn("[SCBE] evaluation annotation commit failed:", commitError);
        }
      }

      // Export the structured marks from the annotations themselves rather
      // than relying only on React state. This captures the latest marker
      // positions/IDs and also recovers metadata embedded in each stamp.
      let marksToSave = evaluationMarks;
      if (annotationCapability?.exportAnnotations) {
        try {
          const transferItems = await annotationCapability
            .exportAnnotations()
            .toPromise();
          marksToSave = readScbeEvaluationMarks(transferItems);
          setEvaluationMarks(marksToSave);
        } catch (annotationExportError) {
          console.warn(
            "[SCBE] Could not export evaluation metadata; using current UI state:",
            annotationExportError,
          );
        }
      }

      const exportedPdf = await exportCapability.saveAsCopy().toPromise();
      const canCreatePdf =
        exportedPdf instanceof Blob ||
        exportedPdf instanceof ArrayBuffer ||
        ArrayBuffer.isView(exportedPdf);
      if (!canCreatePdf) {
        throw new Error("The viewer did not return an exported PDF.");
      }

      const pdfFile = new File(
        [exportedPdf],
        `${sheet.id}-evaluation.pdf`,
        { type: "application/pdf" },
      );
      const formData = new FormData();
      formData.append("pdf", pdfFile);
      // The backend can persist this as a separate JSON field. The same data
      // is also encoded in each marker's PDF subject so it survives PDF-only
      // persistence until the evaluation endpoint stores this field.
      formData.append("evaluationData", JSON.stringify(marksToSave));
      await api.saveEvaluationPdf(user.id, sheet.id, formData);
      setEvaluationMessage("Evaluation saved. Reloading the latest PDF…");
      window.setTimeout(() => window.location.reload(), 400);
    } catch (error) {
      setEvaluationError(error.message || "Unable to save the evaluation PDF.");
    } finally {
      setSavingEvaluation(false);
    }
  }

  function handleMarkSubmit(event) {
    event.preventDefault();
    setMarkError("");
    setMarkStatus("");

    const questionNo = markQuestionNo.trim();
    const marksObtained = Number(markObtained);
    const totalMarks = Number(markTotal);

    if (!questionNo) {
      setMarkError("Enter a question number.");
      return;
    }
    if (
      markObtained === "" ||
      markTotal === "" ||
      !Number.isFinite(marksObtained) ||
      !Number.isFinite(totalMarks) ||
      totalMarks <= 0 ||
      marksObtained < 0 ||
      marksObtained > totalMarks
    ) {
      setMarkError("Enter valid marks, with obtained marks between 0 and the total.");
      return;
    }

    const annotationCapability = annotationCapabilityRef.current;
    if (!annotationCapability?.setActiveTool || !annotationCapability?.setToolDefaults) {
      setMarkError("The PDF annotation tools are not ready yet. Try again in a moment.");
      return;
    }

    // markerId is SCBE's stable record ID; annotationId is assigned by
    // EmbedPDF after the marker is actually placed on a page.
    const mark = {
      markerId:
        globalThis.crypto?.randomUUID?.() ||
        `scbe-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      questionNo,
      part: markPart.trim() || null,
      subpart: markSubpart.trim() || null,
      marksObtained,
      totalMarks,
    };

    pendingMarkRef.current = mark;

    // Include optional part/subpart identifiers in the marker's visible label.
    const questionLabel = `Q${mark.questionNo}${
      mark.part ? `(${mark.part})` : ""
    }${mark.subpart ? `(${mark.subpart})` : ""}`;

    // Keep the visual marker as the original M stamp. The question and score
    // are placed as a separate FreeText annotation after the stamp is created.
    annotationCapability.setToolDefaults(SCBE_MARK_TOOL_ID, {
      subject: `${SCBE_MARK_SUBJECT_PREFIX}${JSON.stringify(mark)}`,
      contents: `${questionLabel} — ${marksObtained}/${totalMarks}`,
      custom: { scbeEvaluation: mark },
    });
    annotationCapability.setActiveTool(SCBE_MARK_TOOL_ID);

    setMarkDialogOpen(false);
    setMarkStatus(`Click the answer sheet to place the marker for ${questionLabel}.`);
  }

  function cancelMarkPlacement() {
    annotationCapabilityRef.current?.setActiveTool?.(null);
    pendingMarkRef.current = null;
    setMarkStatus("Marker placement cancelled.");
  }

  function selectEvaluationMark(mark) {
    if (!mark?.annotationId || mark.pageIndex == null) return;

    // Page indexes in annotations are zero-based; the scroll plugin's
    // scrollToPage API uses one-based page numbers.
    const scrollCapability = viewerRegistry
      ?.getPlugin("scroll")
      ?.provides();
    scrollCapability?.scrollToPage?.({ pageNumber: mark.pageIndex + 1 });

    // Select the actual annotation after requesting the page navigation.
    // Rehydration always uses the current annotation ID from the loaded PDF.
    annotationCapabilityRef.current?.selectAnnotation?.(
      mark.pageIndex,
      mark.annotationId,
    );
  }

  async function resetToOriginal() {
    if (!window.confirm("Reset this sheet to its original PDF? The current evaluated copy will no longer be shown.")) {
      return;
    }

    setEvaluationError("");
    setEvaluationMessage("");
    setSavingEvaluation(true);
    try {
      await api.resetSheetToOriginal(user.id, sheet.id);
      setEvaluationMessage("Original PDF restored. Reloading…");
      window.setTimeout(() => window.location.reload(), 400);
    } catch (error) {
      setEvaluationError(error.message || "Unable to restore the original PDF.");
    } finally {
      setSavingEvaluation(false);
    }
  }

  return (
    <AppShell role={user.role} user={user} onLogout={onLogout}>
      <div className="page-header viewer-header">
        <div>
          <h1>{title}</h1>
          <div className="subtitle">
            {sheet.course?.code || "Unassigned"} ·{" "}
            {sheet.exam?.title || "No examination"} · {sheet.id}
          </div>
        </div>
        <div className="header-actions">
          <Link className="btn btn-outline" to={`/${user.role}/dashboard`}>
            Dashboard
          </Link>
          <a
            className="btn btn-primary"
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open in new tab
          </a>
        </div>
      </div>

      <div className="viewer-shell">
        {complaintContext && (
          <div
            className="complaint-summary panel pad-20"
            style={{ margin: 12 }}
          >
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
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => updateComplaint("Under Review")}
                  >
                    Under review
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => setFacultyActionOpen(true)}
                  >
                    Resolve
                  </button>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => updateComplaint("Resolved")}
                  >
                    Resolve without comment
                  </button>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => updateComplaint("Rejected")}
                  >
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
              <button
                className="btn btn-outline"
                onClick={() => setComplaintOpen(true)}
                type="button"
              >
                Add Complaint
              </button>
            )}
            {user.role === "faculty" && allowEvaluationSave && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={saveEvaluation}
                  type="button"
                  disabled={savingEvaluation}
                >
                  {savingEvaluation ? "Saving…" : "Save Evaluation"}
                </button>
                <button
                  className="btn btn-outline"
                  onClick={resetToOriginal}
                  type="button"
                  disabled={savingEvaluation}
                >
                  Reset To Original
                </button>
              </>
            )}
          </div>
        </div>
        {evaluationError && <div className="error-text">{evaluationError}</div>}
        {evaluationMessage && <div className="success-text">{evaluationMessage}</div>}
        {markStatus && (
          <div className="message-box" style={{ margin: 12 }}>
            <div>{markStatus}</div>
            {pendingMarkRef.current && (
              <button
                className="btn btn-outline"
                type="button"
                style={{ marginTop: 8 }}
                onClick={cancelMarkPlacement}
              >
                Cancel marker placement
              </button>
            )}
          </div>
        )}
        {user.role === "faculty" && allowEvaluationSave && evaluationMarks.length > 0 && (
          <div className="panel pad-20" style={{ margin: 12 }}>
            <div className="title">Evaluation marks</div>
            <div className="row-actions" style={{ marginTop: 10 }}>
              {evaluationMarks.map((mark) => {
                const questionLabel = `Q${mark.questionNo}${
                  mark.part ? `(${mark.part})` : ""
                }${mark.subpart ? `(${mark.subpart})` : ""}`;
                return (
                  <button
                    key={mark.markerId}
                    className="btn btn-outline"
                    type="button"
                    onClick={() => selectEvaluationMark(mark)}
                    title="Select this marker in the PDF"
                  >
                    {questionLabel}: {mark.marksObtained}/{mark.totalMarks}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {pdfError ? (
          <div className="empty-state">{pdfError}</div>
        ) : loadingPdf ? (
          <Loading />
        ) : pdfUrl ? (
          <div
            className="viewer-host"
            style={{
              width: "100%",
              height: "min(80vh, 1000px)",
              minHeight: 500,
            }}
          >
            <PDFViewer
              ref={viewerRef}
              config={{
                src: pdfUrl,
                theme: { preference: "system" },
                export: {
                  defaultFileName: `${sheet.fileName || sheet.id || "document"}.pdf`,
                },
              }}
              className="pdf-viewer"
              style={{ display: "block", width: "100%", height: "100%" }}
              onReady={async (registry) => {
                setViewerRegistry(registry);

                const annotationCapability = registry
                  .getPlugin("annotation")
                  ?.provides();

                if (
                  annotationCapability &&
                  user.role === "faculty" &&
                  allowEvaluationSave
                ) {
                  annotationCapabilityRef.current = annotationCapability;

                  // Register the custom stamp once. EmbedPDF handles click
                  // placement, page coordinates, dragging and resizing.
                  if (!annotationCapability.getTool?.(SCBE_MARK_TOOL_ID)) {
                    annotationCapability.addTool({
                      id: SCBE_MARK_TOOL_ID,
                      name: "SCBE Mark",
                      interaction: {
                        exclusive: true,
                        cursor: "crosshair",
                      },
                      matchScore: (annotation) =>
                        annotation.type === PdfAnnotationSubtype.STAMP &&
                        annotation.subject?.startsWith(SCBE_MARK_SUBJECT_PREFIX)
                          ? 10
                          : 0,
                      defaults: {
                        type: PdfAnnotationSubtype.STAMP,
                        imageSrc: SCBE_MARKER_IMAGE,
                        imageSize: { width: 24, height: 24 },
                      },
                      behavior: {
                        showGhost: true,
                        deactivateToolAfterCreate: true,
                        selectAfterCreate: true,
                      },
                    });
                  }

                  // Track marker lifecycle events so the question summary stays
                  // synchronized when a marker is placed, moved or deleted.
                  annotationEventUnsubscribeRef.current?.();
                  annotationEventUnsubscribeRef.current =
                    annotationCapability.onAnnotationEvent?.(async (event) => {
                      if (event.type === "create") {
                        // Ignore every non-stamp create event first. In particular,
                        // creating the companion FreeText annotation must never
                        // recursively trigger another companion label.
                        if (event.annotation.type !== PdfAnnotationSubtype.STAMP) {
                          return;
                        }

                        // A create event can be reported more than once for the
                        // same stamp. Record its ID before doing any async work so
                        // repeated events cannot create a second text annotation.
                        const markerEventKey = event.annotation.id;
                        if (processedMarkerIdsRef.current.has(markerEventKey)) {
                          return;
                        }
                        processedMarkerIdsRef.current.add(markerEventKey);

                        const mark =
                          readScbeEvaluationMark(event.annotation) ||
                          pendingMarkRef.current;
                        if (!mark) {
                          processedMarkerIdsRef.current.delete(markerEventKey);
                          return;
                        }

                        const questionLabel = getScbeQuestionLabel(mark);
                        let labelAnnotationId = mark.labelAnnotationId || null;

                        // If the marker already references a label (for example,
                        // after restoring annotations), verify that it still exists
                        // before creating another one.
                        if (
                          labelAnnotationId &&
                          !annotationCapability.getAnnotationById?.(labelAnnotationId)
                        ) {
                          labelAnnotationId = null;
                        }

                        // Create a normal, independently editable FreeText PDF
                        // annotation beside the M stamp. Its own ID is stored
                        // in the stamp metadata so the two annotations stay linked.
                        if (!labelAnnotationId) {
                          const candidateLabelId = createScbeAnnotationId();
                          const freeTextDefaults =
                            annotationCapability.getTool?.("freeText")?.defaults || {};
                            console.log(freeTextDefaults);
                          const labelAnnotation = createScbeMarkLabelAnnotation(
                            mark,
                            event.pageIndex,
                            event.annotation.rect,
                            candidateLabelId,
                            freeTextDefaults,
                          );

                          try {
                            if (
                              typeof annotationCapability.createAnnotation !== "function"
                            ) {
                              throw new Error(
                                "EmbedPDF's createAnnotation API is unavailable.",
                              );
                            }
                            annotationCapability.createAnnotation(
                              event.pageIndex,
                              labelAnnotation,
                            );
                            labelAnnotationId = candidateLabelId;
                          } catch (labelError) {
                            console.error(
                              "[SCBE] Unable to create the question/score text annotation:",
                              labelError,
                            );
                          }
                        }

                        const placedMark = {
                          ...mark,
                          labelAnnotationId,
                          annotationId: event.annotation.id,
                          pageIndex: event.pageIndex,
                          rect: event.annotation.rect,
                        };

                        // Persist the companion annotation ID with the marker.
                        // This allows the label to be found again after PDF reload.
                        annotationCapability.updateAnnotation?.(
                          event.pageIndex,
                          event.annotation.id,
                          {
                            subject: `${SCBE_MARK_SUBJECT_PREFIX}${JSON.stringify(placedMark)}`,
                            contents: `${questionLabel} — ${placedMark.marksObtained}/${placedMark.totalMarks}`,
                            custom: { scbeEvaluation: placedMark },
                          },
                        );

                        setEvaluationMarks((current) => [
                          ...current.filter(
                            (item) => item.markerId !== placedMark.markerId,
                          ),
                          placedMark,
                        ]);

                        if (
                          pendingMarkRef.current?.markerId === placedMark.markerId
                        ) {
                          pendingMarkRef.current = null;
                        }

                        setMarkStatus(
                          `Marker placed for ${questionLabel} (${placedMark.marksObtained}/${placedMark.totalMarks}).`,
                        );
                      } else if (event.type === "update") {
                        if (event.annotation.type === PdfAnnotationSubtype.STAMP) {
                          const updatedMark = readScbeEvaluationMark(event.annotation);
                          const updatedMarkerRect =
                            event.patch?.rect || event.annotation.rect;

                          if (updatedMark?.labelAnnotationId && event.patch?.rect) {
                            const questionLabel = getScbeQuestionLabel(updatedMark);
                            const labelText = `${questionLabel}: ${updatedMark.marksObtained}/${updatedMark.totalMarks}`;

                            // Keep the companion text aligned with the M stamp.
                            annotationCapability.updateAnnotation?.(
                              event.pageIndex,
                              updatedMark.labelAnnotationId,
                              {
                                rect: getScbeMarkLabelRect(
                                  updatedMarkerRect,
                                  labelText,
                                ),
                              },
                            );
                          }
                        }

                        setEvaluationMarks((current) =>
                          current.map((item) =>
                            item.annotationId === event.annotation.id
                              ? {
                                  ...item,
                                  pageIndex: event.pageIndex,
                                  rect: event.patch?.rect || event.annotation.rect,
                                }
                              : item,
                          ),
                        );
                      } else if (event.type === "delete") {
                        if (event.annotation.type === PdfAnnotationSubtype.STAMP) {
                          processedMarkerIdsRef.current.delete(event.annotation.id);
                          const deletedMark = readScbeEvaluationMark(event.annotation);
                          if (deletedMark?.labelAnnotationId) {
                            // The label is a separate PDF annotation, so remove
                            // it explicitly when its associated M stamp is deleted.
                            annotationCapability.deleteAnnotation?.(
                              event.pageIndex,
                              deletedMark.labelAnnotationId,
                            );
                          }
                        }

                        setEvaluationMarks((current) =>
                          current.filter(
                            (item) => item.annotationId !== event.annotation.id,
                          ),
                        );
                      } else if (event.type === "loaded") {
                        // Existing markers may already be embedded in a saved
                        // PDF. Re-export after loading to rebuild the summary.
                        try {
                          const task = annotationCapability.exportAnnotations?.();
                          if (task?.toPromise) {
                            const items = await task.toPromise();
                            setEvaluationMarks(readScbeEvaluationMarks(items));
                          }
                        } catch (error) {
                          console.warn(
                            "[SCBE] Unable to restore evaluation marker list:",
                            error,
                          );
                        }
                      }
                    });

                  // onReady can occur after annotations have loaded. Hydrate
                  // immediately as well; the 'loaded' event covers the other
                  // ordering (when annotations finish loading afterwards).
                  try {
                    const task = annotationCapability.exportAnnotations?.();
                    if (task?.toPromise) {
                      const items = await task.toPromise();
                      setEvaluationMarks(readScbeEvaluationMarks(items));
                    }
                  } catch (error) {
                    console.warn(
                      "[SCBE] Unable to read existing evaluation markers:",
                      error,
                    );
                  }
                }

                // Register SCBE's custom Mark command.
const commands = registry.getPlugin("commands")?.provides();
const ui = registry.getPlugin("ui")?.provides();

if (!commands || !ui) {
  console.error("[SCBE] Required EmbedPDF plugins unavailable.");
} else if (user.role === "faculty" && allowEvaluationSave) {
  commands.registerCommand({
    id: "scbe.mark",
    label: "Mark",
    action: () => {
      if (user.role === "faculty" && allowEvaluationSave) {
        setMarkError("");
        setMarkDialogOpen(true);
      }
    },
  });

  const schema = ui.getSchema();

  const toolbar = schema.toolbars["main-toolbar"];

  if (!toolbar) {
    console.error("[SCBE] Main toolbar not found.");
  } else {
    const items = JSON.parse(JSON.stringify(toolbar.items));

    // Avoid inserting the button more than once.
    if (!items.some((item) => item.id === "scbe-mark-button")) {
      items.push({
        type: "command-button",
        id: "scbe-mark-button",
        commandId: "scbe.mark",
        variant: "text",
      });
    }

    ui.mergeSchema({
      toolbars: {
        "main-toolbar": {
          ...toolbar,
          items,
        },
      },
    });

  }
}

                // Workaround for EmbedPDF issue #416: force initial rendering.
                const docManager = registry
                  .getPlugin("document-manager")
                  ?.provides();

                const zoomPlugin = registry.getPlugin("zoom")?.provides();

                if (docManager && zoomPlugin) {
                  docManager.onDocumentOpened((doc) => {
                    window.setTimeout(() => {
                      const docZoom = zoomPlugin.forDocument(doc.id);

                      if (docZoom) {
                        console.info(
                          "[SCBE] Applying initial zoom to document:",
                          doc.id,
                        );
                        docZoom.requestZoom(1);
                      } else {
                        console.warn(
                          "[SCBE] Zoom API unavailable for document:",
                          doc.id,
                        );
                      }
                    }, 100);
                  });
                } else {
                  console.warn(
                    "[SCBE] Document manager or zoom plugin unavailable.",
                  );
                }

                // Import saved annotations only when they exist.
                // Keep this AFTER registering the document-open listener.
                if (complaintContext?.annotationData) {
                  const complaintAnnotationCapability = registry
                    .getPlugin("annotation")
                    ?.provides();

                  try {
                    const annotations = JSON.parse(
                      complaintContext.annotationData || "[]",
                    );

                    const importTask =
                      complaintAnnotationCapability?.importAnnotations?.(annotations);

                    if (importTask?.toPromise) {
                      await importTask.toPromise();
                    }
                  } catch (error) {
                    console.warn(
                      "[SCBE] Unable to import saved annotations:",
                      error,
                    );
                  }
                }
              }}
            />
          </div>
        ) : (
          <div className="empty-state">
            No PDF is attached to this sheet yet.
          </div>
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
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Add Complaint</h3>
              <button
                className="icon-button"
                onClick={() => setComplaintOpen(false)}
                type="button"
              >
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
                  onChange={(event) =>
                    setComplaintDescription(event.target.value)
                  }
                  placeholder="Explain the issue and, if needed, add annotations in the PDF viewer before submitting."
                />
              </div>
              {complaintError && (
                <div className="error-text">{complaintError}</div>
              )}
              {complaintSuccess && (
                <div className="success-text">{complaintSuccess}</div>
              )}
              <div className="row-actions">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={submittingComplaint}
                >
                  {submittingComplaint ? "Submitting…" : "Submit complaint"}
                </button>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setComplaintOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {facultyActionOpen && complaintContext && user.role === "faculty" && (
        <div
          className="modal-backdrop"
          onClick={() => setFacultyActionOpen(false)}
        >
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Resolve complaint</h3>
              <button
                className="icon-button"
                onClick={() => setFacultyActionOpen(false)}
                type="button"
              >
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
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setFacultyActionOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

{markDialogOpen && user.role === "faculty" && allowEvaluationSave && (
        <div
          className="modal-backdrop"
          onClick={() => setMarkDialogOpen(false)}
        >
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Mark question</h3>
              <button
                className="icon-button"
                type="button"
                onClick={() => setMarkDialogOpen(false)}
              >
                ×
              </button>
            </div>

            <form className="stack" onSubmit={handleMarkSubmit}>
              <div className="field">
                <label htmlFor="markQuestionNo">Question number</label>
                <input
                  id="markQuestionNo"
                  value={markQuestionNo}
                  onChange={(event) => setMarkQuestionNo(event.target.value)}
                  placeholder="e.g. 1"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="markPart">Part (optional)</label>
                <input
                  id="markPart"
                  value={markPart}
                  onChange={(event) => setMarkPart(event.target.value)}
                  placeholder="e.g. a"
                />
              </div>
              <div className="field">
                <label htmlFor="markSubpart">Subpart (optional)</label>
                <input
                  id="markSubpart"
                  value={markSubpart}
                  onChange={(event) => setMarkSubpart(event.target.value)}
                  placeholder="e.g. i"
                />
              </div>
              <div className="field">
                <label htmlFor="markObtained">Marks obtained</label>
                <input
                  id="markObtained"
                  type="number"
                  min="0"
                  step="0.5"
                  value={markObtained}
                  onChange={(event) => setMarkObtained(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="markTotal">Total marks</label>
                <input
                  id="markTotal"
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={markTotal}
                  onChange={(event) => setMarkTotal(event.target.value)}
                  required
                />
              </div>
              {markError && <div className="error-text">{markError}</div>}
              <div className="row-actions">
                <button className="btn btn-primary" type="submit">
                  Place marker
                </button>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setMarkDialogOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </AppShell>
  );
}

export function StudentComplaintPage({ user, onLogout }) {
  const { complaintId } = useParams();
  const { data, error } = useResource(
    () => api.studentComplaint(user.id, complaintId),
    [user.id, complaintId],
  );

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
      title="Submitted Complaint Viewer"
    />
  );
}

export function StudentSheetPage({ user, onLogout }) {
  const { sheetId } = useParams();
  const { data, error } = useResource(
    () => api.sheet(sheetId, user.id),
    [sheetId, user.id],
  );

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
  const { data, error } = useResource(
    () => api.sheet(sheetId, user.id),
    [sheetId, user.id],
  );

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

  return (
    <ViewerFrame
      user={user}
      onLogout={onLogout}
      sheet={data}
      title="Generated PDF Viewer"
      allowEvaluationSave
    />
  );
}
