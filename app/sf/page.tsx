import type { Metadata } from "next";
import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import ScrollAnimations from "@/app/components/ScrollAnimations";
import SfHero from "@/app/components/SfHero";

type Release = {
  artist: string;
  title: string;
  displayTitle: string;
  releaseDate: string;
  tag: string;
  videoId: string;
  videoType: string;
  platformLinks?: Partial<Record<ServiceKind, string>>;
};

type ServiceKind = "melon" | "spotify" | "apple";

const releases: Release[] = [
  {
    artist: "13LAYER",
    title: "Melody(너와 나의 멜로디) (Vocal by SunizShine)",
    displayTitle: "Melody",
    releaseDate: "2025.07.14",
    tag: "R&B / Indie",
    videoId: "8I2AxVIPTwY",
    videoType: "Official MV",
    platformLinks: {
      melon: "https://www.melon.com/album/detail.htm?albumId=11890166",
      apple: "https://music.apple.com/kr/album/melody-single/1825617674"
    }
  },
  {
    artist: "13LAYER",
    title: "Melody(너와 나의 멜로디) (Vocal by Iroso)",
    displayTitle: "Melody",
    releaseDate: "2025.07.14",
    tag: "R&B / Indie",
    videoId: "WNTG5tZ19so",
    videoType: "YouTube Video",
    platformLinks: {
      melon: "https://www.melon.com/album/detail.htm?albumId=11890166",
      apple: "https://music.apple.com/kr/album/melody-single/1825617674"
    }
  },
  {
    artist: "Dozen Crepe",
    title: "honeymoon flowers(꽃잠) (Love Drive)",
    displayTitle: "honeymoon flowers",
    releaseDate: "2025.06.24",
    tag: "Winter Spring Summer Autumn",
    videoId: "3bv4NQn1ENk",
    videoType: "Official MV"
  },
  {
    artist: "Dozen Crepe",
    title: "your seasons as mine(서로의 계절)",
    displayTitle: "your seasons as mine",
    releaseDate: "2025.06.24",
    tag: "Winter Spring Summer Autumn",
    videoId: "JNhjS5pxwfE",
    videoType: "YouTube Topic"
  },
  {
    artist: "Odd Factory",
    title: "Fig Wasp",
    displayTitle: "Fig Wasp",
    releaseDate: "2024.12.06",
    tag: "Odd Pop",
    videoId: "imtW6Jo6LE0",
    videoType: "Official MV"
  },
  {
    artist: "grooming shagatto",
    title: "모험은 발끝부터 자란다",
    displayTitle: "Tiptoe to Adventure",
    releaseDate: "2025.09.26",
    tag: "Adventure Pop",
    videoId: "YlgCi9Fnikc",
    videoType: "Official MV"
  }
];

const services = [
  { label: "Melon", kind: "melon" },
  { label: "Spotify", kind: "spotify" },
  { label: "Apple Music", kind: "apple" }
] as const;

export const metadata: Metadata = {
  title: "S/F Archive | 목장의 아침",
  description: "스트레인지 팩토리에서 만든 음원 발매 정보와 유튜브 영상을 모아둔 아카이브."
};

function searchUrl(service: ServiceKind, query: string) {
  const encoded = encodeURIComponent(query);

  if (service === "melon") {
    return `https://www.melon.com/search/total/index.htm?q=${encoded}`;
  }

  if (service === "spotify") {
    return `https://open.spotify.com/search/${encoded}`;
  }

  return `https://music.apple.com/kr/search?term=${encoded}`;
}

function platformUrl(release: Release, service: ServiceKind, query: string) {
  return release.platformLinks?.[service] ?? searchUrl(service, query);
}

function youtubeUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export default function StrangeFactoryPage() {
  return (
    <>
      <Header showApplyCta={false} />
      <main id="top" className="sf-page">
        <SfHero releaseCount={releases.length} />

        <section id="sf-releases" className="sf-release-section" aria-label="스트레인지 팩토리 발매 목록">
          <div className="sf-section-bar">
            <span>RELEASES</span>
            <span>2024 - 2025</span>
          </div>

          <div className="sf-release-list">
            {releases.map((release, index) => {
              const query = `${release.artist} ${release.title}`;

              return (
                <article className="sf-release-card" data-reveal-card key={`${release.artist}-${release.title}`}>
                  <div className="sf-video-frame">
                    <iframe
                      title={`${release.artist} - ${release.title}`}
                      src={`https://www.youtube.com/embed/${release.videoId}`}
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>

                  <div className="sf-release-copy">
                    <div className="sf-release-meta">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <span>{release.releaseDate}</span>
                      <span>{release.videoType}</span>
                    </div>

                    <p className="sf-artist">{release.artist}</p>
                    <h2>{release.displayTitle}</h2>
                    <p className="sf-full-title">{release.title}</p>

                    <dl className="sf-release-details">
                      <div>
                        <dt>TAG</dt>
                        <dd>{release.tag}</dd>
                      </div>
                      <div>
                        <dt>VIDEO</dt>
                        <dd>{release.videoType}</dd>
                      </div>
                    </dl>

                    <div className="sf-platforms" aria-label={`${release.title} 플랫폼 링크`}>
                      {services.map((service) => (
                        <a
                          href={platformUrl(release, service.kind, query)}
                          target="_blank"
                          rel="noreferrer"
                          key={service.kind}
                          data-service={service.kind}
                        >
                          {service.label}
                        </a>
                      ))}
                      <a
                        href={youtubeUrl(release.videoId)}
                        target="_blank"
                        rel="noreferrer"
                        data-service="youtube"
                      >
                        YouTube
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
      <Footer />
      <ScrollAnimations />
    </>
  );
}
