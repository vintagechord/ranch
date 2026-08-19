"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PiggyBankData = {
  balanceAmount: number;
  updatedAt: string | null;
};

const PIGGY_BANK_CACHE_MS = 60_000;

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
  const lastLoadedAtRef = useRef(0);

  const loadPiggyBank = useCallback((signal: AbortSignal) => {
    setIsLoading(true);

    fetch("/api/piggy-bank", {
      cache: "no-store",
      signal
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
        lastLoadedAtRef.current = Date.now();
      })
      .catch(() => {
        if (!signal.aborted) {
          setPiggyBank(null);
        }
      })
      .finally(() => {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    loadPiggyBank(abortController.signal);

    return () => abortController.abort();
  }, [loadPiggyBank]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const hasFreshData = piggyBank && Date.now() - lastLoadedAtRef.current < PIGGY_BANK_CACHE_MS;

    if (hasFreshData) {
      return;
    }

    const abortController = new AbortController();
    loadPiggyBank(abortController.signal);

    return () => abortController.abort();
  }, [isOpen, loadPiggyBank, piggyBank]);

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
          <path className="piggy-tail" d="M8.6 16.4c-2.3-2.4-4.9-1.3-4.5 1 .3 1.7 2.4 2.2 3.8.5" />
          <path className="piggy-leg" d="M11.6 23.2h4.3v5.4h-4.3ZM22.8 23.2h4.3v5.4h-4.3Z" />
          <path className="piggy-ear" d="M22.9 10.2 27.2 6.4l.9 6.5Z" />
          <path className="piggy-body" d="M7.5 17.8c0-5.4 4.6-8.7 11.5-8.7h2.4c5.9 0 9.9 3.4 9.9 8.7s-4.3 8.7-10.6 8.7h-3c-6.3 0-10.2-3.4-10.2-8.7Z" />
          <ellipse className="piggy-snout" cx="31.3" cy="18" rx="3.1" ry="2.7" />
          <path className="piggy-slot" d="M12.9 10.2h11.6" />
          <circle className="piggy-eye" cx="26" cy="15.1" r="1.1" />
          <circle className="piggy-nostril" cx="31.8" cy="18" r="0.75" />
          <circle className="piggy-coin" cx="18.7" cy="7" r="3.1" />
          <path className="piggy-coin-mark" d="M18.7 5.4v3.2" />
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
