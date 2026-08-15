"use client";

import Link from "next/link";
import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import LocationJourneyDialog from "@/app/components/LocationJourneyDialog";
import { StudioReelDeck, StudioSpeaker } from "@/app/components/StudioEquipment";
import { getProjectStatusLabel, type Project } from "@/lib/projects";

type StudioProject = {
  slug: string;
  number: string;
  artist: string;
  title: string;
  state: Project["state"];
  visual: "reel" | "speaker";
};

type ProjectStudioProps = {
  nextMeeting: {
    accessibleDateTime: string;
    dateTime: string;
    dateLabel: string;
    timeLabel: string;
    venue: string;
  };
  projects: StudioProject[];
};

function AcousticDisplay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;

    if (!canvasElement) {
      return;
    }

    const canvas = canvasElement;
    const canvasContext = canvas.getContext("2d");

    if (!canvasContext) {
      return;
    }

    const context = canvasContext;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let previousFrame = 0;
    let visible = true;
    let pausedByUser = document.documentElement.classList.contains("site-motion-paused");
    let paused = reducedMotion.matches || pausedByUser || document.hidden;

    function resizeCanvas() {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(Math.round(bounds.width), 1);
      const height = Math.max(Math.round(bounds.height), 1);

      if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
      }

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      return { width, height };
    }

    function drawRibbon(
      width: number,
      height: number,
      time: number,
      options: {
        center: number;
        amplitude: number;
        thickness: number;
        frequency: number;
        phase: number;
        speed: number;
        colors: [string, string, string];
        glow: string;
      }
    ) {
      const pointStep = Math.max(width / 110, 3);
      const topPoints: Array<[number, number]> = [];
      const bottomPoints: Array<[number, number]> = [];

      for (let x = -pointStep; x <= width + pointStep; x += pointStep) {
        const progress = x / width;
        const carrier =
          Math.sin(progress * Math.PI * 2 * options.frequency + time * options.speed + options.phase) *
          options.amplitude;
        const harmonic =
          Math.sin(progress * Math.PI * 2 * (options.frequency * 1.83) - time * options.speed * 0.46 + options.phase * 1.7) *
          options.amplitude * 0.28;
        const body = options.thickness * (0.76 + Math.sin(progress * Math.PI * 4 + time * 0.38) * 0.24);
        const center = height * options.center + height * (carrier + harmonic);

        topPoints.push([x, center - height * body]);
        bottomPoints.unshift([x, center + height * body]);
      }

      const gradient = context.createLinearGradient(0, height, width, 0);
      gradient.addColorStop(0, options.colors[0]);
      gradient.addColorStop(0.5, options.colors[1]);
      gradient.addColorStop(1, options.colors[2]);

      context.save();
      context.beginPath();
      [...topPoints, ...bottomPoints].forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.fillStyle = gradient;
      context.shadowColor = options.glow;
      context.shadowBlur = Math.max(16, height * 0.14);
      context.fill();
      context.shadowBlur = 0;

      const highlight = context.createLinearGradient(0, 0, width, 0);
      highlight.addColorStop(0, "rgba(255,255,255,0.06)");
      highlight.addColorStop(0.48, "rgba(255,255,255,0.46)");
      highlight.addColorStop(1, "rgba(255,255,255,0.08)");
      context.beginPath();
      topPoints.forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x, y + 1);
        else context.lineTo(x, y + 1);
      });
      context.strokeStyle = highlight;
      context.lineWidth = Math.max(1, height * 0.009);
      context.stroke();
      context.restore();
    }

    function draw(timestamp: number) {
      const { width, height } = resizeCanvas();
      const time = timestamp / 1000;

      context.clearRect(0, 0, width, height);

      const grid = context.createLinearGradient(0, 0, 0, height);
      grid.addColorStop(0, "rgba(113, 238, 255, 0.09)");
      grid.addColorStop(1, "rgba(113, 238, 255, 0.015)");
      context.strokeStyle = grid;
      context.lineWidth = 1;

      for (let x = width / 12; x < width; x += width / 12) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }

      for (let y = height / 4; y < height; y += height / 4) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      drawRibbon(width, height, time, {
        center: 0.48,
        amplitude: 0.2,
        thickness: 0.105,
        frequency: 1.48,
        phase: 2.3,
        speed: 0.38,
        colors: ["#00b9ed", "#315dff", "#7135f5"],
        glow: "rgba(0, 189, 255, 0.5)"
      });
      drawRibbon(width, height, time, {
        center: 0.5,
        amplitude: 0.19,
        thickness: 0.13,
        frequency: 1.16,
        phase: 0.4,
        speed: -0.28,
        colors: ["#6828e8", "#ec167b", "#b918e4"],
        glow: "rgba(225, 24, 154, 0.52)"
      });
      drawRibbon(width, height, time, {
        center: 0.5,
        amplitude: 0.135,
        thickness: 0.055,
        frequency: 1.72,
        phase: -0.8,
        speed: 0.54,
        colors: ["#ff9345", "#ff4c45", "#ff7651"],
        glow: "rgba(255, 91, 63, 0.58)"
      });

      context.beginPath();
      for (let x = 0; x <= width; x += 2) {
        const progress = x / width;
        const y =
          height * 0.5 +
          Math.sin(progress * Math.PI * 18 + time * 1.2) * height * 0.012 +
          Math.sin(progress * Math.PI * 43 - time * 0.7) * height * 0.007;

        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = "rgba(224, 252, 255, 0.64)";
      context.lineWidth = 1;
      context.shadowColor = "rgba(121, 230, 255, 0.9)";
      context.shadowBlur = 8;
      context.stroke();
      context.shadowBlur = 0;
    }

    function animate(timestamp: number) {
      if (timestamp - previousFrame >= 32) {
        draw(timestamp);
        previousFrame = timestamp;
      }

      if (!paused) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    }

    function syncAnimation() {
      paused = pausedByUser || reducedMotion.matches || !visible || document.hidden;
      window.cancelAnimationFrame(animationFrame);

      if (visible && !document.hidden) {
        draw(paused ? 1300 : performance.now());
      }

      if (!paused) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    }

    function handleMotionChange(event: Event) {
      pausedByUser = (event as CustomEvent<{ paused: boolean }>).detail.paused;
      syncAnimation();
    }

    function handleReducedMotionChange() {
      syncAnimation();
    }

    function handleVisibilityChange() {
      syncAnimation();
    }

    const resizeObserver = new ResizeObserver(() => {
      if (visible && !document.hidden) {
        draw(paused ? 1300 : performance.now());
      }
    });
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncAnimation();
    });

    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);
    window.addEventListener("morning-ranch-motion-change", handleMotionChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    reducedMotion.addEventListener("change", handleReducedMotionChange);
    draw(paused ? 1300 : performance.now());

    if (!paused) {
      animationFrame = window.requestAnimationFrame(animate);
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("morning-ranch-motion-change", handleMotionChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reducedMotion.removeEventListener("change", handleReducedMotionChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="studio-acoustic-canvas" aria-hidden="true" />;
}

function MixingDesk() {
  return (
    <div className="studio-mixer" aria-hidden="true">
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

export default function ProjectStudio({ nextMeeting, projects }: ProjectStudioProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const activeProjectCount = projects.length;
  const activeProjectCountLabel = String(activeProjectCount).padStart(2, "0");
  const hasManyProjects = projects.length > 2;

  function moveLight(event: PointerEvent<HTMLDivElement>) {
    if (
      document.documentElement.classList.contains("site-motion-paused") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      event.pointerType === "touch"
    ) {
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
    <section id="project-room" className="studio-hero" aria-labelledby="studio-title">
      <h1 id="studio-title" className="studio-visually-hidden">목장의 아침 프로젝트 룸</h1>

      <div
        ref={stageRef}
        className={`studio-stage${hasManyProjects ? " has-many-projects" : ""}`}
        onPointerMove={moveLight}
        onPointerLeave={resetLight}
      >
        <div className="studio-stage-grid" aria-hidden="true" />
        <div className="studio-stage-glow" aria-hidden="true" />

        <div className="studio-stage-toolbar">
          <span className="studio-live-pill" aria-hidden="true"><i /> LIVE</span>
          <span className="studio-active-count">
            <span className="studio-visually-hidden">현재 활성 프로젝트 {activeProjectCount}개</span>
            <span aria-hidden="true">활성 프로젝트</span>
            <strong aria-hidden="true">{activeProjectCountLabel}</strong>
          </span>
        </div>

        <div className="studio-monitor">
          <AcousticDisplay />
          <div className="studio-monitor-session">
            <span className="studio-monitor-session-label">
              <small>다음 모임:</small>
              <strong aria-hidden="true">NEXT SESSION</strong>
            </span>
            <time
              aria-label={nextMeeting.accessibleDateTime}
              dateTime={nextMeeting.dateTime}
            >
              <span aria-hidden="true">{nextMeeting.dateLabel}</span>
              <b aria-hidden="true">/</b>
              <strong aria-hidden="true">{nextMeeting.timeLabel}</strong>
            </time>
            <LocationJourneyDialog venue={nextMeeting.venue} />
          </div>
        </div>

        <div className="studio-equipment-row">
          {projects.map((project, index) => (
            <Link
              className={`studio-project-object is-${project.visual} is-slot-${index + 1}`}
              href={`/projects/${project.slug}`}
              aria-label={`${project.artist} ‘${project.title}’ 프로젝트 상세 보기`}
              key={project.slug}
            >
              <span className="studio-object-index">PROJECT {project.number}</span>
              {project.visual === "reel" ? <StudioReelDeck /> : <StudioSpeaker />}
              <span className="studio-object-label">
                <small>{project.artist}</small>
                <strong>{project.title}</strong>
                <em><i /> {getProjectStatusLabel(project.state)}</em>
              </span>
              <span className="studio-object-action">OPEN SESSION ↗</span>
            </Link>
          ))}

          <MixingDesk />
        </div>

        <div className="studio-stage-footer">
          {projects.map((project) => (
            <span key={project.slug}>INPUT {project.number} — {project.artist.toUpperCase()}</span>
          ))}
          <span>OUTPUT — ARCHIVE</span>
        </div>
      </div>

    </section>
  );
}
