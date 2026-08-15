"use client";

import { useEffect, useState } from "react";
import AdminActionButton from "@/app/components/AdminActionButton";

type FormAction = (formData: FormData) => void | Promise<void>;
const ACCEPTED_COVER_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif"
]);

type AdminReleaseCoverManagerProps = {
  releaseId: string;
  releaseNumber: number;
  releaseTitle: string;
  currentImageUrl: string | null;
  hasManagedCover: boolean;
  maxFileSizeMb: number;
  uploadAction: FormAction;
  removeAction: FormAction;
};

export default function AdminReleaseCoverManager({
  releaseId,
  releaseNumber,
  releaseTitle,
  currentImageUrl,
  hasManagedCover,
  maxFileSizeMb,
  uploadAction,
  removeAction
}: AdminReleaseCoverManagerProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const titleId = `release-cover-title-${releaseId}`;
  const inputId = `release-cover-file-${releaseId}`;
  const helpId = `release-cover-help-${releaseId}`;
  const visibleImageUrl = previewUrl ?? currentImageUrl;

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  return (
    <section className="admin-release-cover-manager" aria-labelledby={titleId}>
      <div className="admin-release-cover-preview">
        {visibleImageUrl ? (
          <img
            src={visibleImageUrl}
            loading="lazy"
            decoding="async"
            alt={previewUrl
              ? `${releaseTitle} 새 대표 이미지 미리보기`
              : `${releaseTitle} 현재 대표 이미지`}
            onError={() => {
              if (previewUrl) {
                setSelectionError("미리보기를 열 수 없는 이미지입니다. 다른 파일을 선택해 주세요.");
              }
            }}
          />
        ) : (
          <span aria-hidden="true">{String(releaseNumber).padStart(2, "0")}</span>
        )}
        {previewUrl ? <small aria-hidden="true">선택 이미지</small> : null}
      </div>

      <div className="admin-release-cover-copy">
        <div>
          <h4 id={titleId}>대표 이미지</h4>
          <p>공개 페이지의 숫자 자리에 표시됩니다. 중앙을 기준으로 가로형으로 잘립니다.</p>
        </div>

        <form className="admin-release-cover-form" action={uploadAction}>
          <input type="hidden" name="releaseId" value={releaseId} />
          <label className="admin-release-cover-file" htmlFor={inputId}>
            <span>{currentImageUrl ? "새 이미지 선택" : "이미지 선택"}</span>
            <input
              id={inputId}
              name="coverImage"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              aria-describedby={helpId}
              required
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                setSelectionError("");

                if (!file) {
                  setSelectedFile(null);
                  return;
                }
                if (!ACCEPTED_COVER_TYPES.has(file.type)) {
                  event.currentTarget.value = "";
                  setSelectedFile(null);
                  setSelectionError("JPG, PNG, WebP, AVIF 이미지만 선택할 수 있습니다.");
                  return;
                }
                if (file.size > maxFileSizeMb * 1024 * 1024) {
                  event.currentTarget.value = "";
                  setSelectedFile(null);
                  setSelectionError(`이미지는 ${maxFileSizeMb}MB 이하만 선택할 수 있습니다.`);
                  return;
                }

                setSelectedFile(file);
              }}
            />
          </label>
          <AdminActionButton pendingLabel="이미지 처리 중…">
            {currentImageUrl ? "이미지 교체" : "이미지 업로드"}
          </AdminActionButton>
        </form>

        <p className="admin-release-cover-help" id={helpId}>
          JPG · PNG · WebP · AVIF / 최대 {maxFileSizeMb}MB
        </p>
        {selectionError ? (
          <p className="admin-release-cover-client-error" role="alert">
            {selectionError}
          </p>
        ) : null}
        <p className="sr-only" role="status" aria-live="polite">
          {selectedFile
            ? `${selectedFile.name} 선택됨. 새 대표 이미지 미리보기를 표시합니다.`
            : ""}
        </p>

        {hasManagedCover ? (
          <details className="admin-release-cover-remove">
            <summary>이미지 삭제</summary>
            <form action={removeAction}>
              <input type="hidden" name="releaseId" value={releaseId} />
              <p>업로드한 이미지를 삭제하고 기본 화면으로 되돌립니다.</p>
              <AdminActionButton
                className="admin-form-button is-danger"
                pendingLabel="삭제 중…"
              >
                삭제 확정
              </AdminActionButton>
            </form>
          </details>
        ) : null}
      </div>
    </section>
  );
}
