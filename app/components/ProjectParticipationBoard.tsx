"use client";

import ParticipationRequest from "@/app/components/ParticipationRequest";
import type { PublicMusicRelease, ReleaseRoleState } from "@/lib/releaseParticipation";

type ProjectParticipationBoardProps = {
  projectTitle: string;
  release: PublicMusicRelease;
  variant?: "default" | "performance";
};

const PERFORMANCE_GROUPS = [
  {
    key: "direction",
    label: "DIRECTION",
    codes: ["planning", "show_direction", "music_director", "stage_management"]
  },
  {
    key: "performers",
    label: "PERFORMERS",
    codes: ["vocal", "live_guitar", "live_bass", "live_drums", "live_keyboard", "live_percussion"]
  },
  {
    key: "technical",
    label: "TECHNICAL",
    codes: ["foh_engineering", "monitor_engineering", "lighting", "vj_video"]
  },
  {
    key: "creative-operations",
    label: "CREATIVE & OPERATIONS",
    codes: ["photography", "artwork", "promotion_social", "event_operations"]
  }
] as const;

function roleStateLabel(state: ReleaseRoleState) {
  if (state === "filled") return "참여 확정";
  if (state === "paused") return "준비 중";
  return "마감";
}

export default function ProjectParticipationBoard({
  projectTitle,
  release,
  variant = "default"
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
        <section
          className={`project-participation${variant === "performance" ? " is-performance" : ""}`}
          aria-labelledby="project-participation-title"
        >
          <div className="project-section-heading project-participation-heading">
            <span className="project-section-number">01</span>
            <h2 id="project-participation-title">PARTICIPATION</h2>
          </div>

          {(() => {
            const renderLead = (lead: (typeof leads)[number], index: number) => {
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
            };

            if (variant !== "performance") {
              return (
                <ol className="project-participation-grid" aria-label={`${projectTitle} 참여 파트`}>
                  {leads.map(renderLead)}
                </ol>
              );
            }

            const knownCodes = new Set<string>(PERFORMANCE_GROUPS.flatMap((group) => [...group.codes]));
            const groups = PERFORMANCE_GROUPS.map((group) => ({
              ...group,
              leads: leads.filter((lead) => (group.codes as readonly string[]).includes(lead.roleCode))
            })).filter((group) => group.leads.length > 0);
            const uncategorized = leads.filter((lead) => !knownCodes.has(lead.roleCode));
            const indexedLeads = new Map(leads.map((lead, index) => [lead.leadId, index]));

            return (
              <div className="project-participation-groups">
                {[...groups, ...(uncategorized.length > 0 ? [{
                  key: "additional",
                  label: "ADDITIONAL",
                  codes: [] as string[],
                  leads: uncategorized
                }] : [])].map((group) => (
                  <section className="project-participation-group" key={group.key}>
                    <h3>{group.label}</h3>
                    <ol
                      className="project-participation-grid"
                      aria-label={`${projectTitle} ${group.label} 참여 파트`}
                    >
                      {group.leads.map((lead) => renderLead(
                        lead,
                        indexedLeads.get(lead.leadId) ?? 0
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            );
          })()}
        </section>
      )}
    </ParticipationRequest>
  );
}
