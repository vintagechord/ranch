"use client";

import ParticipationRequest, {
  type OpenParticipationRequest
} from "@/app/components/ParticipationRequest";
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

function releaseNumber(value: number) {
  return String(value).padStart(2, "0");
}

function dateParts(value: string | null) {
  if (!value) {
    return { iso: null, year: "", monthDay: "TBA" };
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return { iso: value, year: "", monthDay: value };
  }

  return {
    iso: `${match[1]}-${match[2]}-${match[3]}`,
    year: match[1],
    monthDay: `${match[2]}.${match[3]}`
  };
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
  const date = dateParts(release.releaseDate);
  const rows = getRoleRows(release);
  const titleId = `vc-release-${release.id}`;

  return (
    <article
      className={`vc-release-card${applicationOpen ? " is-application-open" : " is-application-closed"}`}
      aria-labelledby={titleId}
    >
      <header>
        <span>RELEASE {number}</span>
        <span>{applicationOpen ? "APPLICATION OPEN" : "APPLICATION CLOSED"}</span>
      </header>

      <div className="vc-release-poster">
        {release.coverImageUrl ? (
          <img
            src={release.coverImageUrl}
            alt={`${release.title || `Release ${number}`} 아트워크`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <>
            <span className="vc-release-poster-number" aria-hidden="true">{number}</span>
            <div className="vc-release-poster-lines" aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
            </div>
          </>
        )}
        <time
          aria-label={`공개 예정일 ${date.year ? `${date.year}.` : ""}${date.monthDay}`}
          dateTime={date.iso ?? undefined}
        >
          {date.year ? <small>{date.year}</small> : null}
          <strong>{date.monthDay}</strong>
        </time>
      </div>

      <div className="vc-release-card-identity">
        <h3 id={titleId}>{release.title || `Release ${number}`}</h3>
        <span>{release.artistName}</span>
      </div>

      {rows.length > 0 ? (
        <ul className="vc-release-roles" aria-label={`Release ${number} 참여 파트`}>
          {rows.map((row) => (
            <li className={row.lead.canApply ? "is-open" : "is-credited"} key={row.key}>
              <span className="vc-release-role-label">{row.label}</span>
              {row.credits.length > 0 ? (
                <span className="vc-release-credit">
                  {row.credits.map((credit) => (
                    <span key={credit.id}>
                      <b>{credit.displayName}</b>
                    </span>
                  ))}
                </span>
              ) : null}
              {row.lead.canApply ? (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`Release ${number} ${row.label} 참여 희망`}
                  onClick={(event) => openRequest(event, {
                    leadId: row.lead.leadId,
                    contextLabel: `RELEASE ${number}`,
                    roleLabel: row.label
                  })}
                >
                  참여 희망 <span aria-hidden="true">↗</span>
                </button>
              ) : null}
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
                description="YouTube · 발매 완료"
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
                          <span>OUT NOW</span>
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
