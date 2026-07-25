/// <reference types="vite/client" />
import React from "react";
import ReactDOM from "react-dom/client";
import "@trueyy-sdk/web/styles.css";
import { TrueyyProvider, TrueyyMonitor } from "@trueyy-sdk/web";

// In a real ATS, you'd fetch these tokens from your backend (which uses
// @trueyy-sdk/node to mint them). Here we read from URL params for demo.
const url = new URL(window.location.href);
const interviewerToken = url.searchParams.get("interviewer_token") ?? "";

function App() {
  if (!interviewerToken) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Acme ATS</h1>
        <p>Open this page with <code>?interviewer_token=...</code> to embed the monitor.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <header style={{ marginBottom: 12 }}>
        <h1>Acme ATS — interview view</h1>
      </header>
      <TrueyyProvider
        token={interviewerToken}
        baseUrl={import.meta.env.VITE_TRUEYY_BASE_URL ?? "http://localhost:4000"}
        theme={{ primary: "#10b981" }}
      >
        <TrueyyMonitor
          onRiskAlert={(e) => console.log("[Acme] risk", e)}
        />
      </TrueyyProvider>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
