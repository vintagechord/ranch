"use client";

import { useEffect, useRef, useState } from "react";

type PiggyBankData = {
  balanceAmount: number;
  updatedAt: string | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

export default function PiggyBankButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [piggyBank, setPiggyBank] = useState<PiggyBankData | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const abortController = new AbortController();
    setIsLoading(true);

    fetch("/api/piggy-bank", {
      cache: "no-store",
      signal: abortController.signal
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("저금통 정보를 불러오지 못했습니다.");
        }

        return response.json() as Promise<PiggyBankData>;
      })
      .then((data) => {
        setPiggyBank({
          balanceAmount: Number(data.balanceAmount ?? 0),
          updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null
        });
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setPiggyBank(null);
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => abortController.abort();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const balanceLabel = piggyBank ? formatCurrency(piggyBank.balanceAmount) : "-";
  const updatedAtLabel = piggyBank ? formatDate(piggyBank.updatedAt) : "-";

  return (
    <div className="piggy-bank" ref={wrapperRef}>
      <button
        className="piggy-bank-button"
        type="button"
        aria-label="저금통 잔액 보기"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <svg viewBox="0 0 28 28" aria-hidden="true" focusable="false">
          <path d="M8.4 12.1c.9-2.4 3.4-4.1 6.6-4.1h4.3c.9 0 1.7.2 2.4.6l2.5-1.7c.5-.3 1.1 0 1.1.6v4.3c.5.8.8 1.7.8 2.8 0 2.6-1.7 4.8-4.3 5.8v2.1c0 .6-.5 1.1-1.1 1.1h-2.1c-.6 0-1.1-.5-1.1-1.1v-1.2h-6v1.2c0 .6-.5 1.1-1.1 1.1H8.3c-.6 0-1.1-.5-1.1-1.1v-2.1c-1.2-.6-2.1-1.5-2.7-2.5H2.7c-.6 0-1.1-.5-1.1-1.1v-2.3c0-.6.5-1.1 1.1-1.1h1.2c.8-.6 2.8-.9 4.5-1.3Z" />
          <path d="M12.2 7.5c.6-1.8 2.1-3 4-3 1 0 1.8.3 2.6.9" />
          <circle cx="21.5" cy="13.1" r="1" />
        </svg>
      </button>

      {isOpen ? (
        <div className="piggy-bank-popover" role="dialog" aria-label="저금통 잔액">
          <dl>
            <div>
              <dt>잔여 금액</dt>
              <dd>{isLoading && !piggyBank ? "-" : balanceLabel}</dd>
            </div>
            <div>
              <dt>업데이트 날짜</dt>
              <dd>{isLoading && !piggyBank ? "-" : updatedAtLabel}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
