const BASE = "/api";

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

async function upload(path, formData) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Upload failed");
  }
  return data;
}

export const api = {
  health: () => request("/health"),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  register: (payload) => request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  users: () => request("/users"),
  exams: () => request("/exams"),
  studentDashboard: (id) => request(`/students/${id}/dashboard`),
  studentSheets: (id) => request(`/students/${id}/sheets`),
  studentRequests: (id) => request(`/students/${id}/requests`),
  studentComplaints: (id) => request(`/students/${id}/complaints`),
  studentNotifications: (id) => request(`/students/${id}/notifications`),
  studentProfile: (id) => request(`/students/${id}/profile`),
  sheet: (sheetId, userId) => request(`/sheets/${sheetId}${userId ? `?userId=${encodeURIComponent(userId)}` : ""}`),
  submitComplaint: (studentId, sheetId, formData) =>
    upload(`/students/${studentId}/sheets/${sheetId}/complaints`, formData),
  studentComplaint: (studentId, complaintId) => request(`/students/${studentId}/complaints/${complaintId}`),
  submitDiscrepancy: (payload) =>
    request("/discrepancies", { method: "POST", body: JSON.stringify(payload) }),
  facultyDashboard: (id) => request(`/faculty/${id}/dashboard`),
  facultySheets: (id) => request(`/faculty/${id}/sheets`),
  facultyUnassignedSheets: (id) => request(`/faculty/${id}/unassigned-sheets`),
  facultyComplaints: (id) => request(`/faculty/${id}/complaints`),
  facultyComplaint: (facultyId, complaintId) => request(`/faculty/${facultyId}/complaints/${complaintId}`),
  facultyHistory: (id) => request(`/faculty/${id}/history`),
  updateComplaintStatus: (facultyId, complaintId, status, comment = "") =>
    request(`/faculty/${facultyId}/complaints/${complaintId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, comment }),
    }),
  processVideo: (facultyId, formData) => upload(`/faculty/${facultyId}/sheets/process-video`, formData),
  processImages: (facultyId, formData) => upload(`/faculty/${facultyId}/sheets/process-images`, formData),
  modifyPdf: (facultyId, formData) => upload(`/faculty/${facultyId}/sheets/modify`, formData),
  assignSheet: (facultyId, payload) =>
    request(`/faculty/${facultyId}/sheets/assign`, { method: "POST", body: JSON.stringify(payload) }),
  publishSheet: (sheetId) => request(`/sheets/${sheetId}/publish`, { method: "PATCH" }),
  updateDiscrepancy: (id, status) =>
    request(`/discrepancies/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  adminDashboard: () => request("/admin/dashboard"),
  adminStudents: () => request("/admin/students"),
  adminFaculty: () => request("/admin/faculty"),
  adminExaminations: () => request("/admin/examinations"),
  adminAnswerSheets: () => request("/admin/answer-sheets"),
};
