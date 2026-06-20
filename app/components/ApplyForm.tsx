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
        auction_item: textValue(formData, "auction_item"),
        creative_project: textValue(formData, "creative_project"),
        food_note: textValue(formData, "food_note"),
        memo: textValue(formData, "memo"),
        privacy_agreed: formData.get("privacy_agreed") === "on"
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
        message: chatUrl
          ? "신청이 접수되었습니다. 아래 채팅방 링크로 들어와 주세요."
          : "신청이 접수되었습니다. 채팅방 링크가 준비되는 대로 안내하겠습니다.",
        chatUrl
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error instanceof Error ? error.message : "신청 저장 중 오류가 발생했습니다.",
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
        note="신청서 접수하면 채팅방 링크가 오픈됩니다."
      />

      <div className="apply-layout">
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

          <fieldset className="choice-field choice-field-inline">
            <legend>경매 물품 가져올 예정인가요? *</legend>
            <div className="choice-options">
              <label className="choice-option">
                <input name="auction_item" type="radio" value="네" required />
                <span>네</span>
              </label>
              <label className="choice-option">
                <input name="auction_item" type="radio" value="아니오" defaultChecked required />
                <span>아니오</span>
              </label>
              <label className="choice-option">
                <input name="auction_item" type="radio" value="모르겠음" required />
                <span>모르겠음</span>
              </label>
            </div>
          </fieldset>

          <div className="form-note-grid">
            <label>
              <span>창작 캠프에서 소개할 프로젝트</span>
              <textarea
                name="creative_project"
                rows={2}
                placeholder="같이 만들 사람을 찾고 싶은 아이디어나 프로젝트"
              />
            </label>

            <label>
              <span>알레르기 / 못 먹는 음식</span>
              <textarea className="compact-textarea" name="food_note" rows={2} />
            </label>

            <label>
              <span>기타 메모 / 프로그램 제안하기</span>
              <textarea name="memo" rows={2} placeholder="하고 싶은 말이나 프로그램 제안" />
            </label>
          </div>

          <label className="privacy-check">
            <input name="privacy_agreed" type="checkbox" required />
            <span>
              참가 신청 확인 및 안내 연락을 위해 이름, 연락처, 신청 내용을 수집하는 것에
              동의합니다.
            </span>
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
