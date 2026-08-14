"use client";

import Link from "next/link";
import { useRef, type CSSProperties, type PointerEvent } from "react";

type StudioProject = {
  slug: string;
  number: string;
  artist: string;
  title: string;
  status: string;
  visual: "reel" | "speaker";
};

type ProjectStudioProps = {
  projects: StudioProject[];
};

function ReelDeck() {
  return (
    <div className="studio-reel-deck" aria-hidden="true">
      <div className="studio-deck-brand">MORNING TAPE SYSTEM</div>
      <div className="studio-reels">
        <span className="studio-reel">
          <i />
        </span>
        <span className="studio-tape-path" />
        <span className="studio-reel studio-reel-secondary">
          <i />
        </span>
      </div>
      <div className="studio-deck-controls">
        <span className="studio-deck-counter">02:17:AM</span>
        <span className="studio-deck-button is-red" />
        <span className="studio-deck-button" />
        <span className="studio-deck-button" />
      </div>
    </div>
  );
}

function SpeakerStack() {
  return (
    <div className="studio-speaker-stack" aria-hidden="true">
      <div className="studio-speaker-top">
        <span className="studio-speaker-light" />
        <small>VC / POST</small>
      </div>
      <div className="studio-speaker-cone studio-speaker-cone-small">
        <i />
      </div>
      <div className="studio-speaker-cone studio-speaker-cone-large">
        <i />
      </div>
      <div className="studio-speaker-port" />
    </div>
  );
}

function MixingDesk() {
  return (
    <div className="studio-mixer" aria-hidden="true">
      <div className="studio-vu-row">
        {Array.from({ length: 12 }, (_, index) => (
          <span
            key={index}
            style={{
              "--meter-index": index,
              "--meter-height": `${22 + (index % 6) * 13}%`
            } as CSSProperties}
          />
        ))}
      </div>
      <div className="studio-mixer-channels">
        {Array.from({ length: 7 }, (_, index) => (
          <div className="studio-channel" key={index}>
            <i className="studio-knob" />
            <i className="studio-knob studio-knob-small" />
            <span className="studio-fader-track">
              <b style={{ "--fader": `${22 + ((index * 17) % 58)}%` } as CSSProperties} />
            </span>
            <em>{String(index + 1).padStart(2, "0")}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProjectStudio({ projects }: ProjectStudioProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const projectCount = String(projects.length).padStart(2, "0");
  const featuredProjects = projects.slice(0, 2);

  function moveLight(event: PointerEvent<HTMLDivElement>) {
    if (document.documentElement.classList.contains("site-motion-paused") || event.pointerType === "touch") {
      return;
    }

    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const bounds = stage.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;

    stage.style.setProperty("--pointer-x", `${Math.round(x * 100)}%`);
    stage.style.setProperty("--pointer-y", `${Math.round(y * 100)}%`);
    stage.style.setProperty("--tilt-x", `${(0.5 - y) * 4}deg`);
    stage.style.setProperty("--tilt-y", `${(x - 0.5) * 5}deg`);
  }

  function resetLight() {
    const stage = stageRef.current;

    stage?.style.setProperty("--pointer-x", "50%");
    stage?.style.setProperty("--pointer-y", "32%");
    stage?.style.setProperty("--tilt-x", "0deg");
    stage?.style.setProperty("--tilt-y", "0deg");
  }

  return (
    <section className="studio-hero" aria-labelledby="studio-title">
      <div className="studio-hero-copy">
        <div className="studio-kicker-row">
          <p className="studio-kicker">
            <span /> MORNING RANCH / PROJECT ROOM
          </p>
        </div>

        <h1 id="studio-title">
          지금, {projects.length}개의 프로젝트가
          <br />
          <span>재생 중입니다.</span>
        </h1>
        <p className="studio-hero-intro">
          목장의 아침은 음악이 만들어지는 동안의 선택과 흔적을 기록합니다.
          <br />
          장비 위의 프로젝트를 선택해 각 작업실로 들어가세요.
        </p>
      </div>

      <div
        ref={stageRef}
        className="studio-stage"
        onPointerMove={moveLight}
        onPointerLeave={resetLight}
      >
        <div className="studio-stage-grid" aria-hidden="true" />
        <div className="studio-stage-glow" aria-hidden="true" />

        <div className="studio-stage-toolbar">
          <span className="studio-live-pill"><i /> LIVE INPUT</span>
          <span>{projectCount} PROJECT CHANNELS</span>
          <span className="studio-stage-time">SIGNAL ● ACTIVE</span>
        </div>

        <div className="studio-monitor" aria-hidden="true">
          <div className="studio-monitor-topline">
            <span>SESSION://MORNING-RANCH</span>
            <span>STEREO</span>
          </div>
          <div className="studio-waveform">
            {Array.from({ length: 44 }, (_, index) => (
              <i
                key={index}
                style={{
                  "--wave-index": index,
                  "--wave-height": `${12 + ((index * 37) % 82)}%`
                } as CSSProperties}
              />
            ))}
          </div>
          <div className="studio-monitor-copy">
            <strong>SELECT YOUR SIGNAL</strong>
            <span>프로젝트 아이콘을 클릭하세요</span>
          </div>
        </div>

        <div className="studio-equipment-row">
          {featuredProjects.map((project, index) => (
            <Link
              className={`studio-project-object is-${project.visual} is-slot-${index + 1}`}
              href={`/projects/${project.slug}`}
              aria-label={`${project.artist} ‘${project.title}’ 프로젝트 상세 보기`}
              key={project.slug}
            >
              <span className="studio-object-index">PROJECT {project.number}</span>
              {project.visual === "reel" ? <ReelDeck /> : <SpeakerStack />}
              <span className="studio-object-label">
                <small>{project.artist}</small>
                <strong>{project.title}</strong>
                <em><i /> {project.status}</em>
              </span>
              <span className="studio-object-action">OPEN SESSION ↗</span>
            </Link>
          ))}

          <MixingDesk />
        </div>

        <div className="studio-stage-footer">
          {featuredProjects.map((project) => (
            <span key={project.slug}>INPUT {project.number} — {project.artist.toUpperCase()}</span>
          ))}
          <span>OUTPUT — ARCHIVE</span>
        </div>
      </div>

      <a className="studio-scroll-cue" href="#projects" aria-label="프로젝트 목록으로 이동">
        <span>SCROLL TO TRACKS</span>
        <i />
      </a>
    </section>
  );
}
