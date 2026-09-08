# SCBE CV Backend

This service handles the computer-vision and PDF assembly work for SCBE.
It lives under `code/cv` and writes all generated PDFs into `code/data/generated/pdfs`.

## What it does

- Extracts stable pages from a video using frame-difference and Laplacian-sharpness heuristics.
- Stitches uploaded images into a single PDF.
- Modifies an existing PDF by deleting, adding, or replacing a page.

## Install

```bash
cd code/cv
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python app.py
```

The service listens on `http://localhost:5000`.

## Storage layout

- Generated PDFs: `code/data/generated/pdfs`
- Uploaded videos: `code/data/uploaded/videos`
- Uploaded images: `code/data/uploaded/images`

## Routes

### `GET /api/health`

Checks that the service is alive.

Response:

```json
{ "ok": true, "service": "scbe-cv-backend" }
```

### `POST /api/video-to-pdf`

Accepts a video file, extracts pages, and writes a PDF.

Request type: `multipart/form-data`

Fields:

- `video` - required video file
- `output_name` - optional PDF name, for example `answer_sheet_1.pdf`
- `sample_fps` - optional integer, default `20`
- `difference_threshold` - optional float, default `8`
- `flip_frames_required` - optional integer, default `10`
- `stable_frames_required` - optional integer, default `10`

Response:

```json
{
  "pdf_name": "answer_sheet_1.pdf",
  "pdf_path": "/abs/path/to/code/data/generated/pdfs/answer_sheet_1.pdf",
  "source_video": "uploaded_video.mp4",
  "pages_extracted": 4,
  "page_details": [
    {
      "page_number": 1,
      "frame_number": 0,
      "timestamp": 0.0,
      "sharpness": 1234.567
    }
  ],
  "settings": {
    "sample_fps": 20,
    "difference_threshold": 8,
    "flip_frames_required": 10,
    "stable_frames_required": 10
  }
}
```

### `POST /api/images-to-pdf`

Accepts multiple images and stitches them into a PDF in the order they were sent.

Request type: `multipart/form-data`

Fields:

- `images` - repeated file field, or `images[]`
- `output_name` - optional PDF name

Response:

```json
{
  "pdf_name": "answer_sheet_2.pdf",
  "pdf_path": "/abs/path/to/code/data/generated/pdfs/answer_sheet_2.pdf",
  "image_count": 3,
  "source_images": ["page_1.png", "page_2.png", "page_3.png"]
}
```

### `POST /api/pdf/modify`

Modifies an existing PDF by deleting, adding, or replacing a page.

Request type: `multipart/form-data` or JSON for the non-file fields

Fields:

- `operation` - required, one of `delete_page`, `add_page`, `replace_page`
- `source_pdf_name` - existing PDF filename inside `code/data/generated/pdfs`
- `pdf` - optional uploaded source PDF instead of `source_pdf_name`
- `page_number` - required for `delete_page` and `replace_page`, optional for `add_page`; for `add_page`, the image is inserted before this page number
- `image` - required for `add_page` and `replace_page`
- `output_name` - optional PDF name for the modified output

Behavior:

- `delete_page`: removes the selected page
- `add_page`: inserts the supplied image as a new PDF page
- `replace_page`: swaps the selected page with the supplied image

Response:

```json
{
  "output_pdf": "answer_sheet_3.pdf",
  "output_path": "/abs/path/to/code/data/generated/pdfs/answer_sheet_3.pdf",
  "original_page_count": 6,
  "updated_page_count": 6,
  "operation": "replace_page",
  "page_number": 2
}
```

## Calling conventions

From Node.js, call these routes with `fetch` or `axios` using `multipart/form-data` when sending files.

- Use `video` for video uploads.
- Use `images` or `images[]` for page images.
- Use `pdf` and `image` for PDF modification workflows.

The service is intentionally stateless: the returned PDF filename and metadata are what the Node backend should persist.
