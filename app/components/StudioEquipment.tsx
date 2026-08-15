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
