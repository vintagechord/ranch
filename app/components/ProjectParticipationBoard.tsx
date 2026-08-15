"use client";

import ParticipationRequest from "@/app/components/ParticipationRequest";
import type { PublicMusicRelease, ReleaseRoleState } from "@/lib/releaseParticipation";

type ProjectParticipationBoardProps = {
  projectTitle: string;
  release: PublicMusicRelease;
};

function roleStateLabel(state: ReleaseRoleState) {
  if (state === "filled") return "참여 확정";
  if (state === "paused") return "준비 중";
  return "마감";
}

export default function ProjectParticipationBoard({
  projectTitle,
  release
}: ProjectParticipationBoardProps) {
  const leads = [...release.leads].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.roleLabel.localeCompare(b.roleLabel, "ko")
  );

  if (leads.length === 0) {
    return null;
  }

  return (
    <ParticipationRequest>
      {(openRequest) => (
        <section className="project-participation" aria-labelledby="project-participation-title">
          <div className="project-section-heading project-participation-heading">
            <span className="project-section-number">01</span>
            <h2 id="project-participation-title">PARTICIPATION</h2>
          </div>

          <ol className="project-participation-grid" aria-label={`${projectTitle} 참여 파트`}>
            {leads.map((lead, index) => {
              const credits = [...lead.credits].sort((a, b) => a.sortOrder - b.sortOrder);

              return (
                <li data-state={lead.state} key={lead.leadId}>
                  <span className="project-participation-index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong className="project-participation-role">{lead.roleLabel}</strong>

                  <span className="project-participation-credit">
                    {credits.map((credit) => (
                      <span key={credit.id}>
                        <b>{credit.displayName}</b>
                        {credit.isRanchMember ? <small>RANCH MEMBER</small> : null}
                      </span>
                    ))}
                  </span>

                  {lead.canApply ? (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-label={`${projectTitle} ${lead.roleLabel} 참여 희망`}
                      onClick={(event) => openRequest(event, {
                        leadId: lead.leadId,
                        contextLabel: projectTitle,
                        roleLabel: lead.roleLabel
                      })}
                    >
                      참여 희망 <span aria-hidden="true">↗</span>
                    </button>
                  ) : credits.length === 0 ? (
                    <span className="project-participation-state">{roleStateLabel(lead.state)}</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </ParticipationRequest>
  );
}
