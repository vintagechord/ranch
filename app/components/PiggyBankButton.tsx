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
        <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
          <path className="piggy-tail" d="M8.3 17.2c-3.2-.6-4.3-3.8-2.3-5.1 1.6-1 3.5.3 3.1 1.9-.3 1.1-1.5 1.4-2.3.6" />
          <path className="piggy-leg" d="M12.2 24.5v4.2h3.8v-3" />
          <path className="piggy-leg" d="M23.8 24.7v4h3.8v-4.2" />
          <path className="piggy-body" d="M8.7 17.5c.6-5 5.1-8.1 11.4-8.1h2.4c5.6 0 9.8 3.5 9.8 8.2 0 4.9-4.4 8.7-10.6 8.7h-5.8c-4.6 0-8.2-2.2-9.5-5.5H4.7c-.7 0-1.2-.5-1.2-1.2v-2c0-.7.5-1.2 1.2-1.2h2.1c.5-.4 1.1-.7 1.9-.9Z" />
          <path className="piggy-ear" d="M23.8 9.7 27.7 6c.5-.5 1.4-.1 1.3.6l-.7 5.2" />
          <path className="piggy-slot" d="M15.2 8.7h7" />
          <ellipse className="piggy-snout" cx="30.4" cy="17.5" rx="3.1" ry="2.7" />
          <circle className="piggy-eye" cx="25.5" cy="15.2" r="1" />
          <path className="piggy-nostril" d="M29.5 17.2v.1M31.4 17.2v.1" />
          <path className="piggy-coin" d="M17.9 4.7a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
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
