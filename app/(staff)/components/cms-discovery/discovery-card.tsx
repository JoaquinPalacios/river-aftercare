"use client";

import { useId } from "react";

export function CmsWelcomeCard({
  title,
  body,
  onStart,
  onDismiss,
}: {
  title: string;
  body: string;
  onStart: () => void;
  onDismiss: () => void;
}) {
  const titleId = useId();

  return (
    <section
      className="cmsDiscoveryCard"
      aria-labelledby={titleId}
      data-cms-discovery-card="welcome"
    >
      <p className="cmsDiscoveryEyebrow">Welcome</p>
      <h2 id={titleId} className="cmsDiscoveryTitle">
        {title}
      </h2>
      <p className="cmsDiscoveryBody">{body}</p>
      <div className="cmsDiscoveryActions">
        <button
          type="button"
          className="staffBtn staffBtnPrimary"
          onClick={onStart}
        >
          Start tour
        </button>
        <button
          type="button"
          className="staffBtn staffBtnQuiet"
          onClick={onDismiss}
        >
          Skip introduction
        </button>
      </div>
    </section>
  );
}

export function CmsAnnouncementCard({
  title,
  body,
  showMeLabel,
  onShowMe,
  onDismiss,
}: {
  title: string;
  body: string;
  showMeLabel: string | null;
  onShowMe: () => void;
  onDismiss: () => void;
}) {
  const titleId = useId();

  return (
    <section
      className="cmsDiscoveryCard"
      aria-labelledby={titleId}
      data-cms-discovery-card="announcement"
    >
      <p className="cmsDiscoveryEyebrow">New</p>
      <h2 id={titleId} className="cmsDiscoveryTitle">
        {title}
      </h2>
      <p className="cmsDiscoveryBody">{body}</p>
      <div className="cmsDiscoveryActions">
        {showMeLabel ? (
          <button
            type="button"
            className="staffBtn staffBtnPrimary"
            onClick={onShowMe}
          >
            {showMeLabel}
          </button>
        ) : null}
        <button
          type="button"
          className={
            showMeLabel
              ? "staffBtn staffBtnQuiet"
              : "staffBtn staffBtnSecondary"
          }
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
