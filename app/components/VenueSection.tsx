"use client";

import { MouseEvent, useEffect, useRef, useState } from "react";
import SectionTitle from "@/app/components/SectionTitle";

const venueFeatures = ["독채", "파티테이블", "노래방", "침대 3", "다트", "화장실 3", "바베큐존", "모닥불"];
const mapLink =
  "https://map.naver.com/p/search/%EC%9D%B8%EC%B2%9C%20%EC%A4%91%EA%B5%AC%20%EC%9A%A9%EC%9C%A0%EC%84%9C%EB%A1%9C450%EB%B2%88%EA%B8%B8%209%20%EC%9E%90%EB%8B%88%EB%85%B8%EB%8B%88%ED%8E%9C%EC%85%98";
const detailLink = "https://zaninoni.co.kr/28";

const venueDetails = [
  { label: "주소", value: "인천 중구 용유서로450번길 9" },
  { label: "객실", value: "B동 · 파티테이블, 노래방, 침대 3, 다트" },
  { label: "인원", value: "기준 10인 / 최대 15인" },
  { label: "구성", value: "온돌룸 2, 주방 1, 화장실 3, 개별바비큐장" }
];

export default function VenueSection() {
  const [isOpen, setIsOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      openButtonRef.current?.focus();
    };
  }, [isOpen]);

  function closeOnBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      setIsOpen(false);
    }
  }

  return (
    <section id="venue" className="page-section venue-section">
      <SectionTitle eyebrow="PLACE" title="모이는 곳" />

      <div className="venue-card" data-reveal-card>
        <div className="venue-main">
          <div className="venue-title-row">
            <button
              ref={openButtonRef}
              className="venue-title-button"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              onClick={() => setIsOpen(true)}
            >
              <span>을왕리</span>
              <span>자니노니펜션</span>
            </button>
            <button
              className="venue-info-button"
              type="button"
              aria-label="을왕리 자니노니펜션 위치 및 상세 정보 보기"
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              onClick={() => setIsOpen(true)}
            >
              i
            </button>
          </div>
        </div>

        <div className="venue-meta">
          <div>
            <span>DATE</span>
            <strong>7월 17일 - 18일</strong>
          </div>
          <div>
            <span>CHECK-IN</span>
            <strong>15:00</strong>
          </div>
          <div>
            <span>CHECK-OUT</span>
            <strong>11:00</strong>
          </div>
          <div>
            <span>PEOPLE</span>
            <strong>기준 10 / 최대 15</strong>
          </div>
        </div>

        <ul className="venue-features" aria-label="숙소 시설">
          {venueFeatures.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>

      {isOpen ? (
        <div className="venue-modal-backdrop" onMouseDown={closeOnBackdrop}>
          <div
            className="venue-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="venue-modal-title"
          >
            <button
              ref={closeButtonRef}
              className="venue-modal-close"
              type="button"
              aria-label="닫기"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>

            <p className="venue-modal-eyebrow">LOCATION</p>
            <h3 id="venue-modal-title">을왕리 자니노니펜션 B동</h3>

            <dl className="venue-modal-list">
              {venueDetails.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>

            <div className="venue-modal-actions">
              <a href={mapLink} target="_blank" rel="noreferrer">
                지도 보기
              </a>
              <a href={detailLink} target="_blank" rel="noreferrer">
                상세 정보
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
