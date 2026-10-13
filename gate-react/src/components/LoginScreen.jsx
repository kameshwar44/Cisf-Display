import { useState } from "react";
import { api, setToken } from "../api/client.js";
import useClock from "../hooks/useClock.js";
import logo from "../assets/cisf-logo.png";
import Footer from "./Footer.jsx";
import Header from "./Header.jsx";

export default function LoginScreen({ header, onSignedIn }) {
  const { time, date } = useClock();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setToken(result.token);
      onSignedIn();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <Header time={time} date={date} header={header} />

      <main className="login-main" id="main-content">
        <form className="card login-card" onSubmit={submit}>
          <div className="card-header blue">
            <h2 className="card-title">Operator Sign In</h2>
          </div>
          <div className="login-body">
            <img
              src={logo}
              alt=""
              className="login-emblem"
              width="64"
              height="64"
            />
            <p className="login-intro">
              {[
                `${header?.organization || "CISF"} Gate Management System`,
                header?.facility,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            <label className="login-field">
              <span className="dr-label">Username</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="login-field">
              <span className="dr-label">Password</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="approved-btn login-submit"
              disabled={busy}
            >
              {busy ? "Signing in…" : "Sign In"}
            </button>
          </div>
        </form>
      </main>

      <Footer header={header} />
    </div>
  );
}
