"use client";

import {
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState
} from "react";
import type { ReleaseParticipationApplicationPayload } from "@/lib/releaseParticipation";

export type ParticipationRequestTarget = {
  leadId: string;
  contextLabel: string;
  roleLabel: string;
};

export type OpenParticipationRequest = (
  event: MouseEvent<HTMLButtonElement>,
  target: ParticipationRequestTarget
) => void;

type ParticipationRequestProps = {
  children: (openRequest: OpenParticipationRequest) => ReactNode;
};

type SubmitState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export default function ParticipationRequest({ children }: ParticipationRequestProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const successButtonRef = useRef<HTMLButtonElement>(null);
  const idempotencyKeyRef = useRef("");
  const dialogTitleId = useId();
  const contactHintId = useId();
  const [selectedLead, setSelectedLead] = useState<ParticipationRequestTarget | null>(null);
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

  function openRequest(
    event: MouseEvent<HTMLButtonElement>,
    target: ParticipationRequestTarget
  ) {
    activeTriggerRef.current = event.currentTarget;
    idempotencyKeyRef.current = window.crypto.randomUUID();
    setSelectedLead(target);
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
        lead_id: selectedLead.leadId,
        name: textValue(formData, "name"),
        credit_name: textValue(formData, "credit_name"),
        contact: textValue(formData, "contact"),
        portfolio_url: textValue(formData, "portfolio_url"),
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

        throw new Error(result?.message ?? "참여 신청을 저장하지 못했습니다.");
      }

      form.reset();
      setSubmitState({
        status: "success",
        message: result.message ?? "참여 신청을 보냈습니다."
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message:
          error instanceof Error && error.name === "AbortError"
            ? "응답이 늦어지고 있습니다. 다시 시도해 주세요."
            : error instanceof Error
              ? error.message
              : "참여 신청을 저장하지 못했습니다."
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  return (
    <>
      {children(openRequest)}

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
          setSelectedLead(null);
          setSubmitState({ status: "idle", message: "" });
          window.requestAnimationFrame(() => {
            if (activeTriggerRef.current?.isConnected) {
              activeTriggerRef.current.focus();
            }
          });
        }}
      >
        <div className="vc-lead-dialog-panel">
          <header className="vc-lead-dialog-header">
            <div>
              <p>{selectedLead?.contextLabel} / {selectedLead?.roleLabel}</p>
              <h2 id={dialogTitleId}>참여 신청</h2>
            </div>
            <button
              type="button"
              aria-label="참여 신청 닫기"
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
                  <span>이메일 또는 전화번호 *</span>
                  <input
                    name="contact"
                    type="text"
                    maxLength={254}
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="email@example.com 또는 010-0000-0000"
                    aria-describedby={contactHintId}
                    required
                  />
                  <small id={contactHintId}>둘 중 편한 연락 방법 하나만 입력해 주세요.</small>
                </label>
                <label>
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
                  <span>참여 메모 *</span>
                  <textarea name="message" rows={5} minLength={10} maxLength={2000} required />
                </label>
              </div>

              <label className="vc-lead-privacy">
                <input name="privacy_agreed" type="checkbox" required />
                <span>
                  참여 검토와 회신을 위해 이름·활동명·이메일 또는 전화번호·포트폴리오 및 참여 메모를 수집하고 접수일로부터 1년간 보관하는 데 동의합니다.
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
                  {isSubmitting ? "전송 중..." : "신청 보내기"}
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
