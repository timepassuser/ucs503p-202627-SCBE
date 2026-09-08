# SCBE Node Backend

This service sits between the React frontend and the Python CV backend.
It stores application data in SQLite at `code/data/scbe.sqlite` and exposes the
JSON and upload endpoints used by the portal.

## Run

```bash
cd code/backend
npm install
npm run dev
```

The backend listens on `http://localhost:4000`.

## Storage

- SQLite database: `code/data/scbe.sqlite`
- Uploaded videos: `code/data/uploaded/videos`
- Uploaded images: `code/data/uploaded/images`
- Uploaded PDFs for temporary modify workflows: `code/data/uploaded/pdfs`
- Generated PDFs: `code/data/generated/pdfs`

Static files are exposed at:

- `/files/uploaded/videos/<file>`
- `/files/uploaded/images/<file>`
- `/files/uploaded/pdfs/<file>`
- `/files/generated/pdfs/<file>`

## Auth

### `POST /api/auth/login`

Request body:

```json
{ "id": "STUDENT-001", "role": "student", "password": "your-password" }
```

Returns the public user record on success.

### `POST /api/auth/register`

Request body:

```json
{
  "id": "STUDENT-003",
  "name": "Example Student",
  "role": "student",
  "password": "secret",
  "email": "student@example.com",
  "programme": "B.E. Computer Science",
  "semester": 5,
  "designation": ""
}
```

Passwords are hashed with `scrypt` before being stored.

## Shared lookups

### `GET /api/health`
### `GET /api/users`
### `GET /api/exams`
### `GET /api/sheets/:sheetId`

These are read-only helper endpoints used by the portal.

## Student routes

### `GET /api/students/:id/dashboard`
### `GET /api/students/:id/sheets`
### `GET /api/students/:id/requests`
### `GET /api/students/:id/notifications`
### `GET /api/students/:id/profile`

### `POST /api/discrepancies`

Request body:

```json
{
  "sheetId": "SH-2291",
  "studentId": "STUDENT-001",
  "question": "Q3 - Design patterns",
  "message": "I believe this was under-marked."
}
```

### `PATCH /api/discrepancies/:id`

Request body:

```json
{ "status": "Resolved" }
```

## Faculty routes

### `GET /api/faculty/:id/dashboard`
### `GET /api/faculty/:id/sheets`
### `GET /api/faculty/:id/complaints`
### `GET /api/faculty/:id/history`

### `POST /api/faculty/:id/sheets/process-video`

Request type: `multipart/form-data`

Fields:

- `video` - required video file
- `output_name` - optional PDF filename

The backend stores the video in `code/data/uploaded/videos`, forwards it to the CV
service at `http://127.0.0.1:5000/api/video-to-pdf`, then returns the generated PDF metadata.

### `POST /api/faculty/:id/sheets/process-images`

Request type: `multipart/form-data`

Fields:

- `images` - repeated image file field
- `output_name` - optional PDF filename

The backend stores the images in `code/data/uploaded/images`, forwards them to the CV
service, then returns the generated PDF metadata.

### `POST /api/faculty/:id/sheets/modify`

Request type: `multipart/form-data`

Fields:

- `operation` - `delete_page`, `add_page`, or `replace_page`
- `source_pdf_name` - existing PDF name in `code/data/generated/pdfs`
- `pdf` - optional uploaded source PDF
- `page_number` - page index for the change
- `image` - optional replacement or inserted image
- `output_name` - optional output filename

This route forwards the request to the CV backend `/api/pdf/modify`.

### `POST /api/faculty/:id/sheets/assign`

Request body:

```json
{
  "fileName": "answer_sheet_1.pdf",
  "pdfName": "answer_sheet_1.pdf",
  "pdfUrl": "/files/generated/pdfs/answer_sheet_1.pdf",
  "examId": "EX-1",
  "studentId": "STUDENT-001",
  "rollNumber": "STUDENT-001",
  "name": "Gurneet Singh Ahuja",
  "sourceType": "video",
  "pagesExtracted": 4
}
```

Creates the answer-sheet record in SQLite.

### `PATCH /api/sheets/:sheetId/publish`

Marks a sheet as published.

## Admin routes

### `GET /api/admin/dashboard`
### `GET /api/admin/students`
### `GET /api/admin/faculty`
### `GET /api/admin/examinations`
### `GET /api/admin/answer-sheets`

## CV bridge

The Node backend talks to the Python service at `CV_BASE_URL`, defaulting to
`http://127.0.0.1:5000`. The frontend only talks to Node.
