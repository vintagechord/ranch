"use client";

import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useId,
  useRef,
  useState
} from "react";
import type {
  PublicMusicRelease,
  PublicReleaseCredit,
  PublicReleaseLead,
  ReleaseParticipationApplicationPayload
} from "@/lib/releaseParticipation";
import { StudioSpeaker } from "@/app/components/StudioEquipment";

type VintageChordReleasesProps = {
  releases: PublicMusicRelease[];
};

type SubmitState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

type SelectedLead = {
  id: string;
  releaseLabel: string;
  roleLabel: string;
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

const RELEASE_ONE_VIDEO_ID = "rW3Nln-nYQ8";
const RELEASE_ONE_ARTIST = "개미친구 (gamichingoo), ELYU, VAN KIDEN";

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

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

function youtubeVideoId(release?: PublicMusicRelease) {
  if (release?.youtubeVideoId) {
    return release.youtubeVideoId;
  }

  return RELEASE_ONE_VIDEO_ID;
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

export default function VintageChordReleases({ releases }: VintageChordReleasesProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const successButtonRef = useRef<HTMLButtonElement>(null);
  const idempotencyKeyRef = useRef("");
  const dialogTitleId = useId();
  const [selectedLead, setSelectedLead] = useState<SelectedLead | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
    message: ""
  });

  const isSubmitting = submitState.status === "submitting";
  const orderedReleases = [...releases].sort((a, b) => a.releaseNumber - b.releaseNumber);
  const releasedTrack =
    orderedReleases.find((release) => release.releaseNumber === 1) ??
    orderedReleases.find((release) => release.state === "released");
  const upcomingReleases = orderedReleases.filter(
    (release) => release.state === "upcoming"
  );
  const videoId = youtubeVideoId(releasedTrack);
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  useEffect(() => {
    if (submitState.status === "success") {
      successButtonRef.current?.focus();
    }
  }, [submitState.status]);

  function openDialog(
    event: MouseEvent<HTMLButtonElement>,
    lead: PublicReleaseLead,
    release: PublicMusicRelease
  ) {
    activeTriggerRef.current = event.currentTarget;
    idempotencyKeyRef.current = window.crypto.randomUUID();
    setSelectedLead({
      id: lead.leadId,
      releaseLabel: `RELEASE ${releaseNumber(release.releaseNumber)}`,
      roleLabel: lead.roleLabel
    });
    setSubmitState({ status: "idle", message: "" });

    window.requestAnimationFrame(() => {
      if (!dialogRef.current?.open) {
        dialogRef.current?.showModal();
      }
    });
  }

  function closeDialog() {
    if (!isSubmitting) {
      dialogRef.current?.close();
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      closeDialog();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || !selectedLead) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    if (
      formData.get("privacy_agreed") !== "on" ||
      formData.get("credit_publication_agreed") !== "on"
    ) {
      setSubmitState({ status: "error", message: "필수 동의 항목을 확인해 주세요." });
      const missingField = formData.get("privacy_agreed") !== "on"
        ? "privacy_agreed"
        : "credit_publication_agreed";
      const privacyInput = form.elements.namedItem(missingField);

      if (privacyInput instanceof HTMLInputElement) {
        privacyInput.focus();
      }

      return;
    }

    setSubmitState({ status: "submitting", message: "" });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);

    try {
      const idempotencyKey = idempotencyKeyRef.current || window.crypto.randomUUID();
      idempotencyKeyRef.current = idempotencyKey;
      const payload: ReleaseParticipationApplicationPayload = {
        submission_type: "release_participation",
        idempotency_key: idempotencyKey,
        lead_id: selectedLead.id,
        name: textValue(formData, "name"),
        credit_name: textValue(formData, "credit_name"),
        email: textValue(formData, "email"),
        phone: textValue(formData, "phone"),
        portfolio_url: textValue(formData, "portfolio_url"),
        availability: textValue(formData, "availability"),
        message: textValue(formData, "message"),
        privacy_agreed: true,
        credit_publication_agreed: true,
        website: textValue(formData, "website")
      };
      const response = await fetch("/api/release-applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify(payload)
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!response.ok || !result?.ok) {
        if (response.status === 409) {
          idempotencyKeyRef.current = window.crypto.randomUUID();
        }

        throw new Error(result?.message ?? "참여 요청을 저장하지 못했습니다.");
      }

      form.reset();
      setSubmitState({
        status: "success",
        message: result.message ?? "참여 요청을 보냈습니다."
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message:
          error instanceof Error && error.name === "AbortError"
            ? "응답이 늦어지고 있습니다. 다시 시도해 주세요."
            : error instanceof Error
              ? error.message
              : "참여 요청을 저장하지 못했습니다."
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  return (
    <>
      <header className="vc-release-hero">
        <div className="vc-release-hero-copy">
          <p>VINTAGECHORD / RELEASES</p>
          <h1 id="project-title">빈티지코드</h1>
        </div>
        <div className="vc-release-hero-equipment" aria-hidden="true">
          <span className="project-sound-wave is-left" />
          <span className="project-sound-wave is-right" />
          <StudioSpeaker playing />
        </div>
      </header>

      <section className="vc-release-section" aria-labelledby="released-track-title">
        <div className="vc-release-section-heading">
          <span>01</span>
          <p>RELEASED</p>
        </div>

        <article className="vc-release-feature">
          <div className="vc-release-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}`}
              title="개미친구, ELYU, VAN KIDEN - huh 공식 영상"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              loading="lazy"
              allowFullScreen
            />
          </div>
          <div className="vc-release-feature-copy">
            <span className="vc-release-state"><i aria-hidden="true" /> OUT NOW</span>
            <div>
              <h2 id="released-track-title">huh</h2>
              <p>{releasedTrack?.artistName || RELEASE_ONE_ARTIST}</p>
              <strong>PROD. MILD BEATS</strong>
            </div>
            <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">
              YOUTUBE <span aria-hidden="true">↗</span>
            </a>
          </div>
        </article>
      </section>

      {upcomingReleases.length > 0 ? (
        <section className="vc-release-section vc-release-upcoming" aria-labelledby="upcoming-releases-title">
          <div className="vc-release-section-heading">
            <span>02</span>
            <h2 id="upcoming-releases-title">UP NEXT</h2>
          </div>

          <div className="vc-release-grid">
            {upcomingReleases.map((release) => {
              const number = releaseNumber(release.releaseNumber);
              const date = dateParts(release.releaseDate);
              const rows = getRoleRows(release);
              const titleId = `vc-release-${release.id}`;

              return (
                <article className="vc-release-card" aria-labelledby={titleId} key={release.id}>
                  <header>
                    <span>RELEASE {number}</span>
                    <span>SCHEDULED</span>
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
                    <h3 id={titleId}>
                      <time dateTime={date.iso ?? undefined}>
                        {date.year ? <small>{date.year}</small> : null}
                        <strong>{date.monthDay}</strong>
                      </time>
                    </h3>
                  </div>

                  <ul className="vc-release-roles" aria-label={`Release ${number} 참여 파트`}>
                    {rows.map((row) => (
                      <li className={row.lead.canApply ? "is-open" : "is-credited"} key={row.key}>
                        <span className="vc-release-role-label">{row.label}</span>
                        {row.credits.length > 0 ? (
                          <span className="vc-release-credit">
                            {row.credits.map((credit) => (
                              <span key={credit.id}>
                                <b>{credit.displayName}</b>
                                {credit.isRanchMember ? <small>RANCH MEMBER</small> : null}
                              </span>
                            ))}
                          </span>
                        ) : null}
                        {row.lead.canApply ? (
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            aria-label={`Release ${number} ${row.label} 참여 요청`}
                            onClick={(event) => openDialog(event, row.lead, release)}
                          >
                            참여 요청 <span aria-hidden="true">↗</span>
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <dialog
        ref={dialogRef}
        className="vc-lead-dialog"
        aria-labelledby={dialogTitleId}
        onCancel={(event) => {
          if (isSubmitting) {
            event.preventDefault();
          }
        }}
        onClick={handleBackdropClick}
        onClose={() => {
          formRef.current?.reset();
          idempotencyKeyRef.current = "";
          setSubmitState({ status: "idle", message: "" });
          window.requestAnimationFrame(() => activeTriggerRef.current?.focus());
        }}
      >
        <div className="vc-lead-dialog-panel">
          <header className="vc-lead-dialog-header">
            <div>
              <p>{selectedLead?.releaseLabel} / {selectedLead?.roleLabel}</p>
              <h2 id={dialogTitleId}>참여 요청</h2>
            </div>
            <button
              type="button"
              aria-label="참여 요청 닫기"
              onClick={closeDialog}
              disabled={isSubmitting}
            >
              ×
            </button>
          </header>

          {submitState.status === "success" ? (
            <div className="vc-lead-success" role="status">
              <span aria-hidden="true"><i /></span>
              <p>SIGNAL RECEIVED</p>
              <h3>{submitState.message}</h3>
              <button ref={successButtonRef} type="button" onClick={closeDialog}>확인</button>
            </div>
          ) : (
            <form ref={formRef} className="vc-lead-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
              <div className="vc-lead-form-grid">
                <label>
                  <span>이름 *</span>
                  <input name="name" type="text" autoComplete="name" maxLength={80} autoFocus required />
                </label>
                <label>
                  <span>활동명 / 크레딧명 *</span>
                  <input name="credit_name" type="text" maxLength={80} required />
                </label>
                <label>
                  <span>이메일 *</span>
                  <input name="email" type="email" autoComplete="email" maxLength={254} required />
                </label>
                <label>
                  <span>연락처</span>
                  <input name="phone" type="tel" autoComplete="tel" minLength={7} maxLength={40} />
                </label>
                <label className="is-wide">
                  <span>포트폴리오 링크</span>
                  <input
                    name="portfolio_url"
                    type="url"
                    inputMode="url"
                    maxLength={1000}
                    placeholder="https://"
                    pattern="https://.+"
                  />
                </label>
                <label className="is-wide">
                  <span>가능 일정 *</span>
                  <input name="availability" type="text" maxLength={500} required />
                </label>
                <label className="is-wide">
                  <span>참여 메모 *</span>
                  <textarea name="message" rows={5} minLength={10} maxLength={2000} required />
                </label>
              </div>

              <label className="vc-lead-privacy">
                <input name="privacy_agreed" type="checkbox" required />
                <span>
                  참여 검토와 회신을 위해 입력 정보를 수집하며 접수일로부터 1년간 보관하는 데 동의합니다.
                </span>
              </label>

              <label className="vc-lead-privacy">
                <input name="credit_publication_agreed" type="checkbox" required />
                <span>
                  참여 확정 시 활동명·크레딧명이 공개되고 프로젝트 기록이 유지되는 동안 보관되는 데 동의합니다.
                </span>
              </label>

              <label className="vc-lead-honeypot" aria-hidden="true">
                <span>Website</span>
                <input name="website" type="text" autoComplete="off" tabIndex={-1} />
              </label>

              <footer className="vc-lead-form-footer">
                <p className={submitState.status === "error" ? "is-error" : ""} aria-live="polite">
                  {submitState.message}
                </p>
                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "전송 중..." : "요청 보내기"}
                  <span aria-hidden="true">↗</span>
                </button>
              </footer>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
