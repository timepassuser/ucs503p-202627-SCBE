from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image
from PyPDF2 import PdfReader, PdfWriter


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
GENERATED_PDF_DIR = DATA_DIR / "generated" / "pdfs"
UPLOADED_VIDEO_DIR = DATA_DIR / "uploaded" / "videos"
UPLOADED_IMAGE_DIR = DATA_DIR / "uploaded" / "images"

DEFAULT_OUTPUT_PREFIX = "answer_sheet"
VIDEO_SAMPLE_FPS = 20
DIFFERENCE_THRESHOLD = 8
FLIP_FRAMES_REQUIRED = 10
STABLE_FRAMES_REQUIRED = 10


app = Flask(__name__)
CORS(app)


def ensure_directories() -> None:
    for directory in (GENERATED_PDF_DIR, UPLOADED_VIDEO_DIR, UPLOADED_IMAGE_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def sanitize_filename(name: str, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", name or "").strip("._-")
    return cleaned or fallback


def normalize_pdf_name(name: str | None, fallback_prefix: str = DEFAULT_OUTPUT_PREFIX) -> str | None:
    if not name:
        return None
    sanitized = sanitize_filename(name, "")
    if not sanitized:
        return None
    if sanitized.lower().endswith(".pdf"):
        return sanitized
    base_name = sanitized.rsplit(".", 1)[0]
    return f"{sanitize_filename(base_name, fallback_prefix)}.pdf"


def next_output_path(prefix: str = DEFAULT_OUTPUT_PREFIX) -> Path:
    ensure_directories()
    pattern = re.compile(rf"^{re.escape(prefix)}_(\d+)\.pdf$")
    highest = 0
    for path in GENERATED_PDF_DIR.glob(f"{prefix}_*.pdf"):
        match = pattern.match(path.name)
        if match:
            highest = max(highest, int(match.group(1)))
    return GENERATED_PDF_DIR / f"{prefix}_{highest + 1}.pdf"


def save_upload(file_storage, target_dir: Path, fallback_name: str) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = sanitize_filename(getattr(file_storage, "filename", ""), fallback_name)
    path = target_dir / filename
    file_storage.save(path)
    return path


def sharpness_laplacian(frame: np.ndarray) -> float:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def frame_difference(frame1: np.ndarray, frame2: np.ndarray) -> float:
    gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)
    return float(np.mean(cv2.absdiff(gray1, gray2)))


def frames_to_pdf(pages: list[dict[str, Any]], output_path: Path) -> None:
    if not pages:
        raise ValueError("No pages were extracted.")

    pil_pages: list[Image.Image] = []
    for page in pages:
        rgb = cv2.cvtColor(page["frame"], cv2.COLOR_BGR2RGB)
        pil_pages.append(Image.fromarray(rgb).convert("RGB"))

    pil_pages[0].save(output_path, save_all=True, append_images=pil_pages[1:])


def images_to_pdf(image_paths: list[Path], output_path: Path) -> None:
    if not image_paths:
        raise ValueError("At least one image is required.")

    pil_images: list[Image.Image] = []
    for image_path in image_paths:
        pil_images.append(Image.open(image_path).convert("RGB"))

    try:
        pil_images[0].save(output_path, save_all=True, append_images=pil_images[1:])
    finally:
        for image in pil_images:
            image.close()


def extract_pages_from_video(
    video_path: Path,
    sample_fps: int = VIDEO_SAMPLE_FPS,
    difference_threshold: float = DIFFERENCE_THRESHOLD,
    flip_frames_required: int = FLIP_FRAMES_REQUIRED,
    stable_frames_required: int = STABLE_FRAMES_REQUIRED,
) -> dict[str, Any]:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    original_fps = capture.get(cv2.CAP_PROP_FPS)
    if original_fps <= 0:
        capture.release()
        raise RuntimeError("Could not determine video FPS.")

    sample_interval = max(1, round(original_fps / sample_fps))
    state = "STABLE"
    previous_frame = None
    page_candidates: list[dict[str, Any]] = []
    best_pages: list[dict[str, Any]] = []
    flip_count = 0
    stable_count = 0
    frame_number = 0

    while True:
        success, frame = capture.read()
        if not success:
            break

        if frame_number % sample_interval != 0:
            frame_number += 1
            continue

        timestamp = frame_number / original_fps

        if previous_frame is None:
            previous_frame = frame.copy()
            page_candidates.append(
                {
                    "frame": frame.copy(),
                    "frame_number": frame_number,
                    "timestamp": timestamp,
                    "sharpness": sharpness_laplacian(frame),
                }
            )
            frame_number += 1
            continue

        difference = frame_difference(previous_frame, frame)
        is_moving = difference > difference_threshold
        is_stable = difference < difference_threshold

        if state == "STABLE":
            if is_moving:
                flip_count += 1
                stable_count = 0
                if flip_count >= flip_frames_required:
                    if page_candidates:
                        best = max(page_candidates, key=lambda candidate: candidate["sharpness"])
                        best_pages.append(best)
                    state = "FLIPPING"
                    page_candidates = []
                    flip_count = 0
                    stable_count = 0
            else:
                flip_count = 0
                page_candidates.append(
                    {
                        "frame": frame.copy(),
                        "frame_number": frame_number,
                        "timestamp": timestamp,
                        "sharpness": sharpness_laplacian(frame),
                    }
                )
        else:
            if is_stable:
                stable_count += 1
                flip_count = 0
                if stable_count >= stable_frames_required:
                    state = "STABLE"
                    stable_count = 0
                    flip_count = 0
                    page_candidates.append(
                        {
                            "frame": frame.copy(),
                            "frame_number": frame_number,
                            "timestamp": timestamp,
                            "sharpness": sharpness_laplacian(frame),
                        }
                    )
            else:
                stable_count = 0

        previous_frame = frame.copy()
        frame_number += 1

    capture.release()

    if page_candidates:
        best = max(page_candidates, key=lambda candidate: candidate["sharpness"])
        best_pages.append(best)

    return {
        "pages": best_pages,
        "frame_count": frame_number,
        "original_fps": original_fps,
        "sample_fps": sample_fps,
        "sample_interval": sample_interval,
        "difference_threshold": difference_threshold,
        "flip_frames_required": flip_frames_required,
        "stable_frames_required": stable_frames_required,
        "pages_extracted": len(best_pages),
        "page_numbers": list(range(1, len(best_pages) + 1)),
        "page_details": [
            {
                "page_number": index + 1,
                "frame_number": page["frame_number"],
                "timestamp": round(page["timestamp"], 3),
                "sharpness": round(page["sharpness"], 3),
            }
            for index, page in enumerate(best_pages)
        ],
    }


def pdf_page_count(pdf_path: Path) -> int:
    return len(PdfReader(str(pdf_path)).pages)


def image_to_pdf_bytes(image_path: Path) -> io.BytesIO:
    image = Image.open(image_path).convert("RGB")
    buffer = io.BytesIO()
    image.save(buffer, format="PDF")
    image.close()
    buffer.seek(0)
    return buffer


def modify_pdf_document(
    source_pdf_path: Path,
    operation: str,
    page_number: int | None = None,
    image_path: Path | None = None,
    output_path: Path | None = None,
) -> dict[str, Any]:
    reader = PdfReader(str(source_pdf_path))
    writer = PdfWriter()
    original_page_count = len(reader.pages)

    if operation == "delete_page":
        if page_number is None:
            raise ValueError("page_number is required for delete_page")
        index = page_number - 1
        if index < 0 or index >= original_page_count:
            raise ValueError("page_number is out of range")
        for idx, page in enumerate(reader.pages):
            if idx != index:
                writer.add_page(page)

    elif operation == "add_page":
        if image_path is None:
            raise ValueError("image is required for add_page")
        insert_at = original_page_count if page_number is None else max(0, min(page_number - 1, original_page_count))
        image_pdf_buffer = image_to_pdf_bytes(image_path)
        new_page_reader = PdfReader(image_pdf_buffer)
        new_page = new_page_reader.pages[0]
        inserted = False
        for idx, page in enumerate(reader.pages):
            if idx == insert_at and not inserted:
                writer.add_page(new_page)
                inserted = True
            writer.add_page(page)
        if not inserted:
            writer.add_page(new_page)

    elif operation == "replace_page":
        if page_number is None:
            raise ValueError("page_number is required for replace_page")
        if image_path is None:
            raise ValueError("image is required for replace_page")
        index = page_number - 1
        if index < 0 or index >= original_page_count:
            raise ValueError("page_number is out of range")
        image_pdf_buffer = image_to_pdf_bytes(image_path)
        new_page_reader = PdfReader(image_pdf_buffer)
        new_page = new_page_reader.pages[0]
        for idx, page in enumerate(reader.pages):
            writer.add_page(new_page if idx == index else page)

    else:
        raise ValueError("operation must be one of delete_page, add_page, replace_page")

    output_path = output_path or next_output_path("answer_sheet")
    with output_path.open("wb") as file_handle:
        writer.write(file_handle)

    return {
        "output_pdf": output_path.name,
        "output_path": str(output_path),
        "original_page_count": original_page_count,
        "updated_page_count": len(PdfReader(str(output_path)).pages),
        "operation": operation,
        "page_number": page_number,
    }


def json_or_form_payload() -> dict[str, Any]:
    if request.is_json:
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return {}
        return payload
    return request.form.to_dict(flat=True)


@app.get("/api/health")
def health() -> tuple[dict[str, Any], int]:
    ensure_directories()
    return jsonify({"ok": True, "service": "scbe-cv-backend"}), 200


@app.post("/api/video-to-pdf")
def video_to_pdf():
    ensure_directories()
    video = request.files.get("video")
    if video is None:
        return jsonify({"error": "video file is required"}), 400

    payload = json_or_form_payload()
    output_name = normalize_pdf_name(payload.get("output_name"))
    sample_fps = int(payload.get("sample_fps", VIDEO_SAMPLE_FPS))
    difference_threshold = float(payload.get("difference_threshold", DIFFERENCE_THRESHOLD))
    flip_frames_required = int(payload.get("flip_frames_required", FLIP_FRAMES_REQUIRED))
    stable_frames_required = int(payload.get("stable_frames_required", STABLE_FRAMES_REQUIRED))

    saved_video = save_upload(video, UPLOADED_VIDEO_DIR, "uploaded_video.mp4")
    try:
        extraction = extract_pages_from_video(
            saved_video,
            sample_fps=sample_fps,
            difference_threshold=difference_threshold,
            flip_frames_required=flip_frames_required,
            stable_frames_required=stable_frames_required,
        )

        output_path = GENERATED_PDF_DIR / output_name if output_name else next_output_path()
        frames_to_pdf(extraction["pages"], output_path)

        return jsonify(
            {
                "pdf_name": output_path.name,
                "pdf_path": str(output_path),
                "source_video": saved_video.name,
                "pages_extracted": extraction["pages_extracted"],
                "page_details": extraction["page_details"],
                "settings": {
                    "sample_fps": sample_fps,
                    "difference_threshold": difference_threshold,
                    "flip_frames_required": flip_frames_required,
                    "stable_frames_required": stable_frames_required,
                },
            }
        ), 201
    finally:
        if saved_video.exists():
            saved_video.unlink(missing_ok=True)


@app.post("/api/images-to-pdf")
def images_to_pdf_route():
    ensure_directories()
    incoming_images = request.files.getlist("images")
    if not incoming_images:
        incoming_images = request.files.getlist("images[]")
    if not incoming_images:
        return jsonify({"error": "at least one image is required"}), 400

    payload = json_or_form_payload()
    output_name = normalize_pdf_name(payload.get("output_name"))
    output_path = GENERATED_PDF_DIR / output_name if output_name else next_output_path()

    saved_images: list[Path] = []
    try:
        for index, incoming_image in enumerate(incoming_images, start=1):
            saved_images.append(save_upload(incoming_image, UPLOADED_IMAGE_DIR, f"page_{index}.png"))

        images_to_pdf(saved_images, output_path)

        return jsonify(
            {
                "pdf_name": output_path.name,
                "pdf_path": str(output_path),
                "image_count": len(saved_images),
                "source_images": [image.name for image in saved_images],
            }
        ), 201
    finally:
        for image_path in saved_images:
            if image_path.exists():
                image_path.unlink(missing_ok=True)


@app.post("/api/pdf/modify")
def modify_pdf_route():
    ensure_directories()
    payload = json_or_form_payload()
    operation = payload.get("operation")
    if not operation:
        return jsonify({"error": "operation is required"}), 400

    page_number_raw = payload.get("page_number")
    page_number = int(page_number_raw) if page_number_raw not in (None, "", "null") else None
    output_name = normalize_pdf_name(payload.get("output_name"))
    output_path = GENERATED_PDF_DIR / output_name if output_name else next_output_path()

    source_pdf_name = payload.get("source_pdf_name")
    pdf_file = request.files.get("pdf")
    source_pdf_path: Path | None = None
    uploaded_source_pdf = False

    if source_pdf_name:
        normalized_source_name = normalize_pdf_name(source_pdf_name, "source_pdf")
        if normalized_source_name is None:
            return jsonify({"error": "source_pdf_name is invalid"}), 400
        source_pdf_path = GENERATED_PDF_DIR / normalized_source_name
    elif pdf_file is not None:
        source_pdf_path = save_upload(pdf_file, GENERATED_PDF_DIR, "source.pdf")
        uploaded_source_pdf = True

    if source_pdf_path is None or not source_pdf_path.exists():
        return jsonify({"error": "source_pdf_name or pdf file is required"}), 400

    image_file = request.files.get("image")
    image_path: Path | None = None
    if image_file is not None:
        image_path = save_upload(image_file, UPLOADED_IMAGE_DIR, "page.png")

    try:
        result = modify_pdf_document(
            source_pdf_path=source_pdf_path,
            operation=operation,
            page_number=page_number,
            image_path=image_path,
            output_path=output_path,
        )
        return jsonify(result), 201
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    finally:
        if uploaded_source_pdf and source_pdf_path.exists():
            source_pdf_path.unlink(missing_ok=True)
        if image_path is not None and image_path.exists():
            image_path.unlink(missing_ok=True)


if __name__ == "__main__":
    ensure_directories()
    app.run(host="0.0.0.0", port=5000, debug=True)
