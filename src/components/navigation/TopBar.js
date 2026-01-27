import React from "react";
import DocumentSelector from "../forms/DocumentSelector";

export default function TopBar() {
  return (
    <nav className="navbar navbar-dark bg-dark sticky-top border-bottom">
      <div className="container-fluid d-flex align-items-center">

        {/* LEFT: App Title */}
        <div className="navbar-brand fw-semibold">
          Call Center Compliance
        </div>

        {/* CENTER: Animated Logo Video */}
        <div className="mx-auto d-flex align-items-center">
          <video
            src="/logo-animation-video.mp4"
            autoPlay
            muted
            loop
            playsInline
            className="navbar-logo-video"
          />
        </div>

        {/* RIGHT: Document Selector */}
        <div className="d-flex align-items-center gap-2">
          <span className="text-white-50 small d-none d-md-inline">
            Select Mode:
          </span>
          <DocumentSelector />
        </div>

      </div>
    </nav>
  );
}
