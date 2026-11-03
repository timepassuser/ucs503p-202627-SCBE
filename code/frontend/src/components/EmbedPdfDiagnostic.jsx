import { useState } from "react";
import { PDFViewer } from "@embedpdf/react-pdf-viewer";

/**
 * Temporary diagnostic route for isolating EmbedPDF's initial-render issue.
 * It intentionally avoids custom zoom settings, Blob URLs, annotations,
 * export calls, and application-specific viewer CSS.
 */
export default function EmbedPdfDiagnostic() {
  const [viewerKey, setViewerKey] = useState(0);

  return (
    <main
      style={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: "100vh",
        minHeight: 0,
        padding: 12,
        width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <strong>EmbedPDF isolated render test</strong>
        <button type="button" onClick={() => setViewerKey((key) => key + 1)}>
          Remount viewer
        </button>
      </div>

      <p style={{ margin: 0 }}>
        Expected result: the sample PDF should be visible immediately, without
        clicking zoom or interacting with the viewer.
      </p>

      <div style={{ flex: 1, minHeight: 0, width: "100%" }}>
        <PDFViewer
          key={viewerKey}
          config={{
            src: "https://snippet.embedpdf.com/ebook.pdf",
            theme: { preference: "light" },
          }}
          style={{ display: "block", height: "100%", width: "100%" }}
          onReady={(registry) => {
            console.info("[EmbedPDF diagnostic] onReady fired", registry);
          }}
        />
      </div>
    </main>
  );
}
