"use client";

import ParticipationRequest, {
  type OpenParticipationRequest
} from "@/app/components/ParticipationRequest";
import ConfirmedParticipants from "@/app/components/ConfirmedParticipants";
import { StudioSpeaker } from "@/app/components/StudioEquipment";
import type {
  PublicMusicRelease,
  PublicReleaseCredit,
  PublicReleaseLead
} from "@/lib/releaseParticipation";

type VintageChordReleasesProps = {
  releases: PublicMusicRelease[];
  subcopy: string;
};

type RoleRow = {
  key: string;
  label: string;
  lead: PublicReleaseLead;
  credits: PublicReleaseCredit[];
};

const ROLE_ORDER = new Map([
  ["artwork", 10],
  ["liner_notes", 20],
  ["music_video", 30],
  ["composition", 40],
  ["lyrics", 50],
  ["arrangement", 60],
  ["vocal", 70]
]);

const KOREAN_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric"
});

function releaseNumber(value: number) {
  return String(value).padStart(2, "0");
}

function dateParts(
  value: string | null,
  { endExclusive = false }: { endExclusive?: boolean } = {}
) {
  if (!value) {
    return {
      iso: null,
      korean: "일정 확인 중",
      accessible: "일정 확인 중"
    };
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    const month = Number(match[2]);
    const day = Number(match[3]);

    return {
      iso: value,
      korean: `${month}월 ${day}일`,
      accessible: `${match[1]}년 ${month}월 ${day}일`
    };
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return {
      iso: value,
      korean: value,
      accessible: value
    };
  }

  const displayDate = new Date(timestamp - (endExclusive ? 1 : 0));
  const formattedParts = KOREAN_DATE_FORMATTER.formatToParts(displayDate);
  const year = formattedParts.find((part) => part.type === "year")?.value ?? "";
  const month = Number(formattedParts.find((part) => part.type === "month")?.value);
  const day = Number(formattedParts.find((part) => part.type === "day")?.value);

  return {
    iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    korean: `${month}월 ${day}일`,
    accessible: `${year}년 ${month}월 ${day}일`
  };
}

function releaseDeadline(release: PublicMusicRelease, applicationOpen: boolean) {
  const relevantLeads = applicationOpen
    ? release.leads.filter((lead) => lead.canApply)
    : release.leads;

  if (
    relevantLeads.length === 0 ||
    relevantLeads.some((lead) => !lead.applicationDeadline)
  ) {
    return null;
  }

  const deadlines = relevantLeads
    .map((lead) => lead.applicationDeadline)
    .filter((deadline): deadline is string => Boolean(deadline))
    .sort((a, b) => {
      const timestampA = Date.parse(a);
      const timestampB = Date.parse(b);

      if (Number.isNaN(timestampA) || Number.isNaN(timestampB)) {
        return b.localeCompare(a);
      }

      return timestampB - timestampA;
    });

  return deadlines[0] ?? null;
}

function youtubeVideoId(release: PublicMusicRelease) {
  return release.youtubeVideoId;
}

function getRoleRows(release: PublicMusicRelease) {
  return release.leads
    .filter((lead) => lead.credits.length > 0 || lead.canApply)
    .map((lead) => ({
      key: lead.roleCode,
      label: lead.roleLabel,
      lead,
      credits: [...lead.credits].sort((a, b) => a.sortOrder - b.sortOrder)
    } satisfies RoleRow))
    .sort((a, b) => {
      const orderA = ROLE_ORDER.get(a.key) ?? 999;
      const orderB = ROLE_ORDER.get(b.key) ?? 999;

      return orderA - orderB || a.lead.sortOrder - b.lead.sortOrder || a.label.localeCompare(b.label, "ko");
    });
}

function posterDescription(value: string | null) {
  const normalized = value?.trim() ?? "";

  if (normalized.length <= 300) {
    return normalized || null;
  }

  return `${normalized.slice(0, 299).trimEnd()}…`;
}

function posterDescriptionLines(value: string | null) {
  const description = posterDescription(value);

  if (!description) {
    return [];
  }

  const lines: string[] = [];
  let lineStart = 0;

  for (let index = 0; index < description.length; index += 1) {
    const character = description[index];
    const nextCharacter = description[index + 1];

    if (".!?".includes(character) && nextCharacter && /\s/u.test(nextCharacter)) {
      lines.push(description.slice(lineStart, index + 1).trim());
      lineStart = index + 1;
    }
  }

  lines.push(description.slice(lineStart).trim());
  return lines.filter(Boolean);
}

function UpcomingReleaseCard({
  release,
  openRequest,
  applicationOpen
}: {
  release: PublicMusicRelease;
  openRequest: OpenParticipationRequest;
  applicationOpen: boolean;
}) {
  const number = releaseNumber(release.releaseNumber);
  const deadline = dateParts(releaseDeadline(release, applicationOpen), { endExclusive: true });
  const rows = getRoleRows(release);
  const titleId = `vc-release-${release.id}`;
  const descriptionLines = posterDescriptionLines(release.summary);
  const hasDescription = descriptionLines.length > 0;

  return (
    <article
      className={`vc-release-card${applicationOpen ? " is-application-open" : " is-application-closed"}`}
      aria-labelledby={titleId}
    >
      <header>
        <span>PROJECT {number}</span>
        <span>{applicationOpen ? "신청 접수 중" : "접수 마감"}</span>
      </header>

      <div className={`vc-release-poster${hasDescription ? " has-description" : ""}`}>
        {release.coverImageUrl ? (
          <img
            src={release.coverImageUrl}
            alt={`${release.title || `Project ${number}`} 아트워크`}
            loading="lazy"
            decoding="async"
          />
        ) : hasDescription ? null : (
          <>
            <span className="vc-release-poster-number" aria-hidden="true">{number}</span>
            <div className="vc-release-poster-lines" aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
            </div>
          </>
        )}
        {hasDescription ? (
          <p className="vc-release-poster-description">
            {descriptionLines.map((line, index) => (
              <span key={`${line}-${index}`}>{line}</span>
            ))}
          </p>
        ) : null}
        <div className="vc-release-deadline">
          <span aria-hidden="true">접수 마감</span>
          <time
            aria-label={`접수 마감일 ${deadline.accessible}`}
            dateTime={deadline.iso ?? undefined}
          >
            <strong>{deadline.korean}</strong>
            {applicationOpen && deadline.iso ? <small>까지</small> : null}
          </time>
        </div>
      </div>

      <div className="vc-release-card-identity">
        <h3 id={titleId}>{release.title || `Project ${number}`}</h3>
      </div>

      {rows.length > 0 ? (
        <ul className="vc-release-roles" aria-label={`Project ${number} 참여 파트`}>
          {rows.map((row) => (
            <li className={row.lead.canApply ? "is-open" : "is-credited"} key={row.key}>
              <span className="vc-release-role-label">{row.label}</span>
              <div
                className={`vc-release-role-actions${row.credits.length > 0 && row.lead.canApply ? " has-mixed-actions" : ""}`}
              >
                {row.credits.length > 0 ? (
                  <ConfirmedParticipants
                    className="vc-release-credit"
                    credits={row.credits}
                    collapsible={row.lead.canApply}
                    contextLabel={`PROJECT ${number}`}
                    roleLabel={row.label}
                  />
                ) : null}
                {row.lead.canApply ? (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={`Project ${number} ${row.label} 참여 희망`}
                    onClick={(event) => openRequest(event, {
                      leadId: row.lead.leadId,
                      contextLabel: `PROJECT ${number}`,
                      roleLabel: row.label
                    })}
                  >
                    <span className="participation-button-label">참여 희망</span>
                    <span className="participation-button-icon" aria-hidden="true">↗</span>
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function ReleaseSectionHeading({
  number,
  title,
  description,
  titleId
}: {
  number: string;
  title: string;
  description: string;
  titleId: string;
}) {
  return (
    <div className="vc-release-section-heading">
      <span>{number}</span>
      <div className="vc-release-section-heading-copy">
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function VintageChordReleases({ releases, subcopy }: VintageChordReleasesProps) {
  const orderedReleases = [...releases].sort((a, b) => a.releaseNumber - b.releaseNumber);
  const upcomingReleases = orderedReleases.filter((release) => release.state === "upcoming");
  const openReleases = upcomingReleases.filter((release) => (
    release.leads.some((lead) => lead.canApply)
  ));
  const closedReleases = upcomingReleases.filter((release) => (
    !release.leads.some((lead) => lead.canApply)
  ));
  const releasedReleases = orderedReleases
    .filter((release) => release.state === "released")
    .sort((a, b) => b.releaseNumber - a.releaseNumber);
  const closedSectionNumber = String(openReleases.length > 0 ? 2 : 1).padStart(2, "0");
  const releasedSectionNumber = String(
    (openReleases.length > 0 ? 1 : 0) + (closedReleases.length > 0 ? 1 : 0) + 1
  ).padStart(2, "0");

  return (
    <ParticipationRequest>
      {(openRequest) => (
        <>
          <header className="vc-release-hero">
            <div className="vc-release-hero-copy">
              <p className="vc-release-eyebrow">POST PRODUCTION PROJECT</p>
              <h1 id="project-title">PPP</h1>
              <p className="project-title-subcopy vc-release-subcopy">{subcopy}</p>
            </div>
            <div className="vc-release-hero-equipment" aria-hidden="true">
              <span className="project-sound-wave is-left" />
              <span className="project-sound-wave is-right" />
              <StudioSpeaker playing />
            </div>
          </header>

          {openReleases.length > 0 ? (
            <section className="vc-release-section vc-release-state-section vc-release-open" aria-labelledby="open-releases-title">
              <ReleaseSectionHeading
                number="01"
                title="OPEN PROJECTS"
                description="참여 신청 가능"
                titleId="open-releases-title"
              />

              <div className="vc-release-grid">
                {openReleases.map((release) => (
                  <UpcomingReleaseCard
                    applicationOpen
                    key={release.id}
                    openRequest={openRequest}
                    release={release}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {closedReleases.length > 0 ? (
            <section className="vc-release-section vc-release-state-section vc-release-closed" aria-labelledby="closed-releases-title">
              <ReleaseSectionHeading
                number={closedSectionNumber}
                title="CLOSED PROJECTS"
                description="참여 모집 마감"
                titleId="closed-releases-title"
              />

              <div className="vc-release-grid">
                {closedReleases.map((release) => (
                  <UpcomingReleaseCard
                    applicationOpen={false}
                    key={release.id}
                    openRequest={openRequest}
                    release={release}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {releasedReleases.length > 0 ? (
            <section className="vc-release-section vc-release-state-section vc-release-released" aria-labelledby="released-tracks-title">
              <ReleaseSectionHeading
                number={releasedSectionNumber}
                title="RELEASED"
                description="발매 완료"
                titleId="released-tracks-title"
              />

              <div
                className="vc-released-rail"
                role="region"
                aria-label="발매된 음원 가로 목록"
                tabIndex={releasedReleases.length > 1 ? 0 : -1}
              >
                {releasedReleases.map((release) => {
                  const number = releaseNumber(release.releaseNumber);
                  const releasedDate = dateParts(release.releaseDate);
                  const videoId = youtubeVideoId(release);
                  const youtubeUrl = videoId
                    ? `https://www.youtube.com/watch?v=${videoId}`
                    : null;
                  const coverUrl = release.coverImageUrl || (videoId
                    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
                    : null);
                  const titleId = `vc-released-${release.id}`;

                  return (
                    <article className="vc-released-card" aria-labelledby={titleId} key={release.id}>
                      {youtubeUrl ? (
                        <a
                          className="vc-released-card-media"
                          href={youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${release.title} YouTube에서 재생`}
                        >
                          {coverUrl ? <img src={coverUrl} alt="" loading="lazy" decoding="async" /> : null}
                          <span aria-hidden="true">▶</span>
                        </a>
                      ) : (
                        <div className="vc-released-card-media" aria-hidden="true">
                          {coverUrl ? <img src={coverUrl} alt="" loading="lazy" decoding="async" /> : null}
                          <span>{number}</span>
                        </div>
                      )}

                      <div className="vc-released-card-copy">
                        <div>
                          <span>RELEASE {number}</span>
                          <time
                            aria-label={`발매일 ${releasedDate.accessible}`}
                            dateTime={releasedDate.iso ?? undefined}
                          >
                            발매 {releasedDate.korean}
                          </time>
                        </div>
                        <h3 id={titleId}>{release.title}</h3>
                        <p>{release.artistName}</p>
                        {release.summary ? <strong>{release.summary}</strong> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      )}
    </ParticipationRequest>
  );
}
