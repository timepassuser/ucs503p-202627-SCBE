import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";

const ROLES = [
  { key: "student", label: "Student" },
  { key: "faculty", label: "Faculty" },
  { key: "admin", label: "Admin" },
];

function RoleTabs({ role, setRole, setId, setPassword, setError }) {
  return (
    <div className="role-tabs">
      {ROLES.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`role-tab ${role === item.key ? "active" : ""}`}
          onClick={() => {
            setRole(item.key);
            setId("");
            setPassword("");
            setError("");
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  const [role, setRole] = useState("student");
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { user } = await api.login({ id, role, password });
      onLogin(user);
      navigate(`/${user.role}/dashboard`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="brand">
          <div className="brand-mark">S</div>
          SCBE
        </div>
          <div>
            <h1>Review answer sheets with less friction.</h1>
            <p>
              SCBE gives students access to evaluated sheets, faculty a cleaner upload and review
              flow, and the examination cell a single place to track the paper trail.
            </p>
            <ul className="hero-points">
              <li>Scoped portals for student, faculty, and admin access</li>
              <li>Video and image processing routed through the CV backend</li>
              <li>Generated PDFs land in `code/data/generated/pdfs`</li>
            </ul>
          </div>
        <div className="foot-note">Semi Computer-Based Evaluation</div>
      </div>

      <div className="auth-form-wrap">
        <div className="auth-card">
          <h2>Welcome back</h2>
          <p className="subtitle">Sign in to continue to your portal</p>

          <RoleTabs
            role={role}
            setRole={setRole}
            setId={setId}
            setPassword={setPassword}
            setError={setError}
          />

          <div className="hint-box">
            Sign in with the account you created for that role.
          </div>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="login-id">Roll No. / Faculty ID</label>
              <input id="login-id" value={id} onChange={(event) => setId(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="auth-foot">
            New here? <Link to="/register">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage({ onLogin }) {
  const navigate = useNavigate();
  const [role, setRole] = useState("student");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [programme, setProgramme] = useState("");
  const [classSection, setClassSection] = useState("");
  const [semester, setSemester] = useState("");
  const [designation, setDesignation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        id,
        name,
        role,
        email,
        password,
        programme: role === "student" ? programme : "",
        classSection: role === "student" ? classSection : "",
        semester: role === "student" ? semester : "",
        designation: role === "student" ? "" : designation,
      };
      const { user } = await api.register(payload);
      onLogin(user);
      navigate(`/${user.role}/dashboard`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-hero auth-hero-register">
        <div className="brand">
          <div className="brand-mark">S</div>
          SCBE
        </div>
        <div>
          <h1>Create an account for the correct portal.</h1>
          <p>
            New student, faculty, or admin accounts can be added here. Passwords are hashed before
            they are written to SQLite at `code/data/scbe.sqlite`.
          </p>
          <ul className="hero-points">
            <li>Passwords are stored as salted hashes</li>
            <li>Role determines the visible navigation and routes</li>
            <li>Each user signs up before signing in</li>
          </ul>
        </div>
        <div className="foot-note">Account setup and access control</div>
      </div>

      <div className="auth-form-wrap">
        <div className="auth-card">
          <h2>Create account</h2>
          <p className="subtitle">Add a student, faculty member, or admin user</p>

          <RoleTabs
            role={role}
            setRole={setRole}
            setId={setId}
            setPassword={setPassword}
            setError={setError}
          />

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="register-id">ID / Roll No.</label>
              <input id="register-id" value={id} onChange={(event) => setId(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="register-name">Full name</label>
              <input id="register-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="register-email">Email</label>
              <input id="register-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="register-password">Password</label>
              <input
                id="register-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {role === "student" ? (
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="programme">Programme</label>
                  <input id="programme" value={programme} onChange={(event) => setProgramme(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="classSection">Class section</label>
                  <input
                    id="classSection"
                    value={classSection}
                    onChange={(event) => setClassSection(event.target.value)}
                    placeholder="A / B / C"
                  />
                </div>
                <div className="field">
                  <label htmlFor="semester">Semester</label>
                  <input
                    id="semester"
                    type="number"
                    min="1"
                    max="10"
                    value={semester}
                    onChange={(event) => setSemester(event.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="designation">Designation</label>
                <input
                  id="designation"
                  value={designation}
                  onChange={(event) => setDesignation(event.target.value)}
                />
              </div>
            )}

            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>

          <p className="auth-foot">
            Already have an account? <Link to="/">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
