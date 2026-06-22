"use client";

import { useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { Participant } from "@/lib/participants";

type ParticipantSelectorProps = {
  participants: Participant[];
};

const GRID_COLUMNS = 4;

export default function ParticipantSelector({ participants }: ParticipantSelectorProps) {
  const [selectedId, setSelectedId] = useState(participants[0]?.id ?? "");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = Math.max(
    participants.findIndex((participant) => participant.id === selectedId),
    0
  );
  const selectedParticipant = participants[selectedIndex];

  const stageStyle = useMemo(
    () =>
      ({
        "--participant-accent": selectedParticipant?.accentColor ?? "#ffd95a"
      }) as CSSProperties,
    [selectedParticipant?.accentColor]
  );

  function selectParticipant(index: number, shouldFocus = false) {
    const participant = participants[index];

    if (!participant) {
      return;
    }

    setSelectedId(participant.id);

    if (shouldFocus) {
      window.requestAnimationFrame(() => tabRefs.current[index]?.focus());
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = participants.length - 1;
    let nextIndex = index;

    if (event.key === "ArrowRight") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === "ArrowLeft") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === "ArrowDown") {
      nextIndex = Math.min(index + GRID_COLUMNS, lastIndex);
    } else if (event.key === "ArrowUp") {
      nextIndex = Math.max(index - GRID_COLUMNS, 0);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    } else {
      return;
    }

    event.preventDefault();
    selectParticipant(nextIndex, true);
  }

  if (!selectedParticipant) {
    return null;
  }

  return (
    <section className="participant-selector" aria-labelledby="participant-title">
      <div className="participant-stage" style={stageStyle}>
        <div
          id="participant-panel"
          className="participant-showcase"
          role="tabpanel"
          aria-labelledby={`${selectedParticipant.id}-tab`}
        >
          <div className="participant-screen-meta">
            <span>PLAYER SELECT</span>
          </div>

          <div className="participant-portrait-frame" key={selectedParticipant.id}>
            <img src={selectedParticipant.imageUrl} alt={`${selectedParticipant.name} 캐릭터`} />
          </div>

          <div className="participant-nameplate">
            <p>RANCH PLAYER</p>
            <h1 id="participant-title">{selectedParticipant.name}</h1>
          </div>
        </div>

        <div className="participant-roster">
          <div className="participant-roster-header">
            <span>CHARACTER SELECT</span>
            <span>{participants.length} PLAYERS</span>
          </div>

          <div className="participant-grid" role="tablist" aria-label="참가자 캐릭터 선택">
            {participants.map((participant, index) => {
              const isSelected = participant.id === selectedParticipant.id;

              return (
                <button
                  id={`${participant.id}-tab`}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  className={`participant-tab${isSelected ? " is-selected" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls="participant-panel"
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => selectParticipant(index)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  key={participant.id}
                  style={{ "--participant-tile-accent": participant.accentColor } as CSSProperties}
                >
                  <img src={participant.imageUrl} alt="" loading={index < 6 ? "eager" : "lazy"} />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
