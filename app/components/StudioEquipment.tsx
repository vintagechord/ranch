import type { CSSProperties } from "react";

type EquipmentProps = {
  className?: string;
};

type StudioSpeakerProps = EquipmentProps & {
  playing?: boolean;
};

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function StudioReelDeck({ className }: EquipmentProps) {
  return (
    <div className={classNames("studio-reel-deck", className)} aria-hidden="true">
      <div className="studio-deck-top-rail" />
      <div className="studio-reels">
        <span className="studio-reel">
          <span className="studio-reel-slots"><b /><b /><b /></span>
          <i className="studio-reel-hub"><b /></i>
        </span>
        <span className="studio-tape-path" />
        <span className="studio-reel studio-reel-secondary">
          <span className="studio-reel-slots"><b /><b /><b /></span>
          <i className="studio-reel-hub"><b /></i>
        </span>
      </div>
      <div className="studio-tape-transport">
        <span className="studio-tape-guide is-left" />
        <span className="studio-head-cover" />
        <span className="studio-tape-guide is-right" />
      </div>
      <div className="studio-deck-control-panel">
        <div className="studio-deck-toggle-bank">
          {Array.from({ length: 4 }, (_, index) => <span key={index}><i /></span>)}
        </div>
        <div className="studio-deck-knob-bank">
          {Array.from({ length: 4 }, (_, index) => <span key={index}><i /></span>)}
        </div>
        <div className="studio-deck-vu-pair">
          <span><i /></span>
          <span><i /></span>
        </div>
        <div className="studio-deck-transport-buttons">
          {Array.from({ length: 6 }, (_, index) => (
            <span className={index === 5 ? "is-record" : ""} key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function StudioSpeaker({ className, playing = false }: StudioSpeakerProps) {
  return (
    <div
      className={classNames("studio-speaker-stack", playing && "is-playing", className)}
      aria-hidden="true"
    >
      <div className="studio-speaker-depth" />
      <div className="studio-mm45-baffle">
        <div className="studio-mm45-woofer">
          <span><i /></span>
          <b className="studio-driver-screws" />
        </div>
        <div className="studio-mm45-array">
          <div className="studio-mm45-mid is-top"><span /></div>
          <div className="studio-mm45-tweeter"><span /></div>
          <div className="studio-mm45-mid is-bottom"><span /></div>
          <b className="studio-driver-screws" />
        </div>
        <span className="studio-speaker-light" />
      </div>
    </div>
  );
}

export function StudioMixer({ className }: EquipmentProps) {
  return (
    <div className={classNames("studio-mixer", className)} aria-hidden="true">
      <div className="studio-mixer-meter-bridge">
        <div className="studio-mixer-meter-bank">
          {Array.from({ length: 3 }, (_, index) => (
            <span className={index === 2 ? "is-correlation" : ""} key={index}><i /></span>
          ))}
        </div>
        <div className="studio-mixer-signal-lights">
          {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
        </div>
      </div>
      <div className="studio-mixer-channels">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            className={`studio-channel${index >= 6 ? " is-master" : ""}`}
            key={index}
            style={{ "--channel-index": index } as CSSProperties}
          >
            <span className="studio-channel-cap" />
            <div className="studio-channel-knobs">
              <i className="studio-knob is-gain" />
              <i className="studio-knob is-eq" />
              <i className="studio-knob is-aux" />
              <i className="studio-knob is-pan" />
            </div>
            <div className="studio-channel-switches"><i /><i /></div>
            <span className="studio-fader-track">
              <b
                className={index === 6 ? "is-blue" : index === 7 ? "is-red" : ""}
                style={{ "--fader": `${20 + ((index * 13) % 56)}%` } as CSSProperties}
              />
            </span>
            <em>{String(index + 1).padStart(2, "0")}</em>
          </div>
        ))}
      </div>
    </div>
  );
}
