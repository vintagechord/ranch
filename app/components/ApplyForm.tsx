"use client";

import { FormEvent, useState } from "react";
import SectionTitle from "@/app/components/SectionTitle";

type SubmitState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
  chatUrl: string | null;
};

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(formData: FormData, key: string) {
  const value = textValue(formData, key);
  return value ? Number(value) : null;
}

export default function ApplyForm() {
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
    message: "",
    chatUrl: null
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitState.status === "submitting") {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    setSubmitState({ status: "submitting", message: "", chatUrl: null });

    try {
      const payload = {
        name: textValue(formData, "name"),
        phone: textValue(formData, "phone"),
        email: textValue(formData, "email"),
        instagram: textValue(formData, "instagram"),
        attendees: numberValue(formData, "attendees"),
        message: textValue(formData, "message")
      };

      const response = await fetch("/api/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; chatUrl?: string | null }
        | null;

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message ?? "신청 저장 중 오류가 발생했습니다.");
      }

      form.reset();
      const chatUrl = typeof result.chatUrl === "string" && result.chatUrl.trim()
        ? result.chatUrl.trim()
        : null;

      setSubmitState({
        status: "success",
        message: result.message ?? "신청이 완료되었습니다. 목장에서 만나요 🐄",
        chatUrl
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message: "신청 중 오류가 발생했습니다.",
        chatUrl: null
      });
    }
  }

  const isSubmitting = submitState.status === "submitting";

  return (
    <section id="apply" className="page-section apply-section">
      <SectionTitle
        eyebrow="APPLY"
        title="참가 신청"
      />

      <div className="apply-layout">
        <div className="apply-instructions">
          <p>신청서 접수하면 채팅방 링크가 보여집니다.</p>
        </div>

        <form className="apply-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              <span>이름 *</span>
              <input name="name" type="text" autoComplete="name" required />
            </label>

            <label>
              <span>연락처 *</span>
              <input name="phone" type="tel" autoComplete="tel" required />
            </label>
          </div>

          <div className="form-grid">
            <label>
              <span>이메일</span>
              <input name="email" type="email" autoComplete="email" />
            </label>

            <label>
              <span>인스타그램</span>
              <input name="instagram" type="text" autoComplete="off" placeholder="@username" />
            </label>
          </div>

          <label>
            <span>참석 인원</span>
            <input name="attendees" type="number" min="1" step="1" inputMode="numeric" />
          </label>

          <label>
            <span>메시지</span>
            <textarea name="message" rows={4} placeholder="하고 싶은 말" />
          </label>

          <div className="form-footer">
            <button className="submit-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "신청 중..." : "신청 접수하기"}
            </button>
          </div>

          <div className={`form-message ${submitState.status}`} aria-live="polite">
            <span>{submitState.message}</span>
            {submitState.status === "success" && submitState.chatUrl ? (
              <a href={submitState.chatUrl} target="_blank" rel="noreferrer">
                오픈채팅방 들어가기
              </a>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
