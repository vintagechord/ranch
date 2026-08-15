"use client";

import { FormEvent, MouseEvent, useEffect, useRef, useState } from "react";
import {
  PROJECT_BUDGET_RANGES,
  PROJECT_STAGES,
  PROJECT_SUPPORT_OPTIONS,
  PROJECT_TYPES
} from "@/lib/projectProposals";

type SubmitState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

type ProjectProposalProps = {
  channelNumber: string;
};

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export default function ProjectProposal({ channelNumber }: ProjectProposalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const successButtonRef = useRef<HTMLButtonElement>(null);
  const idempotencyKeyRef = useRef("");
  const openedFromHashRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
    message: ""
  });

  const isSubmitting = submitState.status === "submitting";

  useEffect(() => {
    if (submitState.status === "success") {
      successButtonRef.current?.focus();
    }
  }, [submitState.status]);

  function openDialog(trigger?: HTMLElement | null, fromHash = false) {
    const dialog = dialogRef.current;

    if (!dialog || dialog.open) {
      return;
    }

    const activeElement = document.activeElement;
    returnFocusRef.current = trigger
      ?? (activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null);
    openedFromHashRef.current = fromHash;
    idempotencyKeyRef.current = window.crypto.randomUUID();
    setSubmitState({ status: "idle", message: "" });
    dialog.showModal();
  }

  useEffect(() => {
    let animationFrame = 0;

    function openFromHash() {
      if (window.location.hash !== "#project-proposal") {
        const dialog = dialogRef.current;

        if (openedFromHashRef.current && dialog?.open) {
          if (submittingRef.current) {
            window.history.replaceState(
              null,
              "",
              `${window.location.pathname}${window.location.search}#project-proposal`
            );
          } else {
            openedFromHashRef.current = false;
            dialog.close();
          }
        }

        return;
      }

      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => openDialog(undefined, true));
    }

    openFromHash();
    window.addEventListener("hashchange", openFromHash);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("hashchange", openFromHash);
    };
  }, []);

  useEffect(() => {
    submittingRef.current = isSubmitting;

    if (
      !isSubmitting
      && openedFromHashRef.current
      && window.location.hash !== "#project-proposal"
      && dialogRef.current?.open
    ) {
      openedFromHashRef.current = false;
      dialogRef.current.close();
    }
  }, [isSubmitting]);

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

    if (isSubmitting) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const supportNeeded = formData
      .getAll("support_needed")
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);

    if (supportNeeded.length === 0) {
      setSubmitState({ status: "error", message: "필요한 작업을 한 개 이상 선택해 주세요." });
      form.querySelector<HTMLInputElement>('input[name="support_needed"]')?.focus();
      return;
    }

    setSubmitState({ status: "submitting", message: "" });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);

    try {
      const idempotencyKey = idempotencyKeyRef.current || window.crypto.randomUUID();
      idempotencyKeyRef.current = idempotencyKey;
      const response = await fetch("/api/project-proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          submission_type: "project_proposal",
          idempotency_key: idempotencyKey,
          name: textValue(formData, "name"),
          phone: textValue(formData, "phone"),
          email: textValue(formData, "email"),
          artist_name: textValue(formData, "artist_name"),
          project_title: textValue(formData, "project_title"),
          project_type: textValue(formData, "project_type"),
          current_stage: textValue(formData, "current_stage"),
          support_needed: supportNeeded,
          desired_schedule: textValue(formData, "desired_schedule"),
          budget_range: textValue(formData, "budget_range"),
          reference_url: textValue(formData, "reference_url"),
          details: textValue(formData, "details"),
          privacy_agreed: formData.get("privacy_agreed") === "on",
          website: textValue(formData, "website")
        })
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!response.ok || !result?.ok) {
        if (response.status === 409) {
          idempotencyKeyRef.current = window.crypto.randomUUID();
        }

        throw new Error(result?.message ?? "제안서를 저장하지 못했습니다.");
      }

      form.reset();
      setSubmitState({
        status: "success",
        message: result.message ?? "프로젝트 제안이 접수되었습니다."
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message:
          error instanceof Error && error.name === "AbortError"
            ? "응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요."
            : error instanceof Error
              ? error.message
              : "제안서를 저장하지 못했습니다."
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  return (
    <>
      <section
        id="project-proposal"
        className="studio-proposal-section"
        aria-labelledby="project-proposal-title"
        data-reveal-card
      >
        <div>
          <p>PROJECT PROPOSAL / CHANNEL {channelNumber}</p>
          <h2 id="project-proposal-title">프로젝트 제안</h2>
        </div>
        <p>함께 만들고 싶은 소리를 연결해 주세요.</p>
        <button
          ref={openButtonRef}
          className="studio-proposal-open"
          type="button"
          aria-haspopup="dialog"
          aria-label="프로젝트 제안서 열기"
          onClick={(event) => openDialog(event.currentTarget)}
        >
          <span aria-hidden="true">＋</span>
          <small>OPEN</small>
        </button>
      </section>

      <dialog
        ref={dialogRef}
        className="proposal-dialog"
        aria-labelledby="proposal-dialog-title"
        onCancel={(event) => {
          if (isSubmitting) {
            event.preventDefault();
          }
        }}
        onClick={handleBackdropClick}
        onClose={() => {
          const returnFocusTarget = returnFocusRef.current;
          openedFromHashRef.current = false;
          returnFocusRef.current = null;
          formRef.current?.reset();
          idempotencyKeyRef.current = "";
          setSubmitState({ status: "idle", message: "" });

          if (window.location.hash === "#project-proposal") {
            window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          }

          window.requestAnimationFrame(() => {
            if (returnFocusTarget?.isConnected) {
              returnFocusTarget.focus();
            } else {
              openButtonRef.current?.focus();
            }
          });
        }}
      >
        <div className="proposal-dialog-panel">
          <header className="proposal-dialog-header">
            <div>
              <p>INPUT {channelNumber} / PROJECT PROPOSAL</p>
              <h2 id="proposal-dialog-title">프로젝트 제안</h2>
            </div>
            <button
              type="button"
              className="proposal-dialog-close"
              aria-label="제안서 닫기"
              onClick={closeDialog}
              disabled={isSubmitting}
            >
              ×
            </button>
          </header>

          {submitState.status === "success" ? (
            <div className="proposal-success" role="status">
              <span aria-hidden="true"><i /></span>
              <p>SIGNAL RECEIVED</p>
              <h3>{submitState.message}</h3>
              <p>검토 후 입력하신 연락처로 답변드리겠습니다.</p>
              <button ref={successButtonRef} type="button" onClick={closeDialog}>확인</button>
            </div>
          ) : (
            <form ref={formRef} className="proposal-form" onSubmit={handleSubmit}>
              <div className="proposal-form-intro">
                <p>제안 내용을 남겨주시면 프로젝트의 방향과 협업 가능성을 함께 검토합니다.</p>
                <span>* 필수 입력</span>
              </div>

              <div className="proposal-form-grid">
                <label>
                  <span>담당자 이름 *</span>
                  <input name="name" type="text" autoComplete="name" maxLength={80} autoFocus required />
                </label>
                <label>
                  <span>연락처</span>
                  <input name="phone" type="tel" autoComplete="tel" minLength={7} maxLength={40} />
                </label>
                <label>
                  <span>이메일 *</span>
                  <input name="email" type="email" autoComplete="email" maxLength={254} required />
                </label>
                <label>
                  <span>아티스트 / 팀명 *</span>
                  <input name="artist_name" type="text" maxLength={100} required />
                </label>
                <label>
                  <span>프로젝트명 *</span>
                  <input name="project_title" type="text" maxLength={140} required />
                </label>
                <label>
                  <span>프로젝트 유형 *</span>
                  <select name="project_type" defaultValue="" required>
                    <option value="" disabled>선택</option>
                    {PROJECT_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  <span>현재 단계 *</span>
                  <select name="current_stage" defaultValue="" required>
                    <option value="" disabled>선택</option>
                    {PROJECT_STAGES.map((stage) => <option value={stage} key={stage}>{stage}</option>)}
                  </select>
                </label>
                <label>
                  <span>희망 일정</span>
                  <input name="desired_schedule" type="text" maxLength={120} placeholder="예: 2026년 10월 발매" />
                </label>
                <label>
                  <span>예산 범위</span>
                  <select name="budget_range" defaultValue="">
                    <option value="">선택 안 함</option>
                    {PROJECT_BUDGET_RANGES.map((range) => <option value={range} key={range}>{range}</option>)}
                  </select>
                </label>
                <label>
                  <span>음원 / 자료 링크</span>
                  <input
                    name="reference_url"
                    type="url"
                    inputMode="url"
                    maxLength={1000}
                    placeholder="https://"
                    pattern="https://.+"
                  />
                </label>
              </div>

              <fieldset className="proposal-support-field">
                <legend>필요한 작업 *</legend>
                <div>
                  {PROJECT_SUPPORT_OPTIONS.map((option) => (
                    <label key={option}>
                      <input name="support_needed" type="checkbox" value={option} />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="proposal-details-field">
                <span>제안 내용 *</span>
                <textarea
                  name="details"
                  rows={6}
                  minLength={20}
                  maxLength={3000}
                  placeholder="만들고 싶은 프로젝트와 현재 준비된 내용을 알려주세요."
                  required
                />
              </label>

              <label className="proposal-privacy">
                <input name="privacy_agreed" type="checkbox" required />
                <span>
                  제안 검토와 회신을 위해 이름, 이메일, 선택 입력 연락처와 제안 내용을 수집하며,
                  접수일로부터 1년간 보관하는 데 동의합니다.
                </span>
              </label>

              <label className="proposal-honeypot" aria-hidden="true">
                <span>Website</span>
                <input name="website" type="text" autoComplete="off" tabIndex={-1} />
              </label>

              <footer className="proposal-form-footer">
                <p className={`proposal-form-message is-${submitState.status}`} aria-live="polite">
                  {submitState.message}
                </p>
                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "전송 중..." : "제안 보내기"}
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
