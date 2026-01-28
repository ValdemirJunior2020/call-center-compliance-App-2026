import React from "react";
import DocumentSelector from "./forms/DocumentSelector";

export default function TopBar({ showLoading = false }) {
  return (
    <nav className="topbar navbar navbar-dark bg-dark sticky-top border-bottom">
      <div className="topbar-inner">
        {/* LEFT: App Title */}
        <div className="topbar-left">
          <span className="navbar-brand fw-semibold m-0">
            Call Center Compliance
          </span>
        </div>

        {/* CENTER: Logo (centered no matter what) */}
        <div className="topbar-center">
          <video
            src="/logo-animation-video.mp4"
            autoPlay
            muted
            loop
            playsInline
            className={`navbar-logo-video ${showLoading ? "loading" : ""}`}
          />
        </div>

        {/* RIGHT: Document Selector */}
        <div className="topbar-right">
          <span className="text-white-50 small d-none d-md-inline me-2">
            Select Mode:
          </span>
          <DocumentSelector />
        </div>
      </div>
    </nav>
  );
}
