import type { Metadata } from "next";
import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import ParticipantSelector from "@/app/components/ParticipantSelector";
import ScrollAnimations from "@/app/components/ScrollAnimations";
import { getParticipantImageSettings } from "@/lib/participantImages";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { buildParticipants, getParticipantInitials } from "@/lib/participants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "참가자 | 목장의 아침",
  description: "목장의 아침 을왕리 에디션 참가자 캐릭터 선택 화면."
};

const REPO_MANAGED_PARTICIPANT_IMAGE_SLOTS = new Set([1]);

type ApplicationNameRow = {
  name: string | null;
};

type ParticipantSettingMaps = {
  displayNamesBySlot: Map<number, string>;
  imageUrlsBySlot: Map<number, string>;
};

function normalizeParticipantName(name: string | null) {
  return name?.trim().replace(/\s+/g, " ") ?? "";
}

function isExcludedParticipantName(name: string) {
  const lowerName = name.toLowerCase();

  return lowerName.includes("codex") || name === "테스트";
}

async function getRegisteredParticipantDisplayNames() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ranch_applications")
      .select("name, created_at")
      .order("created_at", { ascending: true })
      .limit(300);

    if (error) {
      throw new Error(error.message);
    }

    const seenNames = new Set<string>();
    const displayNames: string[] = [];

    for (const application of (data ?? []) as ApplicationNameRow[]) {
      const name = normalizeParticipantName(application.name);
      const nameKey = name.toLowerCase();

      if (!name || isExcludedParticipantName(name) || seenNames.has(nameKey)) {
        continue;
      }

      seenNames.add(nameKey);
      displayNames.push(getParticipantInitials(name));

      if (displayNames.length === 16) {
        break;
      }
    }

    return displayNames;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Missing Supabase admin environment variables:")
    ) {
      return [];
    }

    console.error(
      "Participant names load failed:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

function getEmptyParticipantSettingMaps(): ParticipantSettingMaps {
  return {
    displayNamesBySlot: new Map<number, string>(),
    imageUrlsBySlot: new Map<number, string>()
  };
}

async function getRegisteredParticipantSettings() {
  try {
    const settings = await getParticipantImageSettings();

    return {
      displayNamesBySlot: new Map(
        settings
          .filter((setting) => Boolean(setting.displayName))
          .map((setting) => [setting.slotNumber, setting.displayName as string])
      ),
      imageUrlsBySlot: new Map(
        settings
          .filter((setting) => Boolean(setting.imageUrl))
          .map((setting) => [setting.slotNumber, setting.imageUrl as string])
      )
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Missing Supabase admin environment variables:")
    ) {
      return getEmptyParticipantSettingMaps();
    }

    console.error(
      "Participant settings load failed:",
      error instanceof Error ? error.message : error
    );
    return getEmptyParticipantSettingMaps();
  }
}

export default async function ParticipantsPage() {
  const [registeredDisplayNames, participantSettings] = await Promise.all([
    getRegisteredParticipantDisplayNames(),
    getRegisteredParticipantSettings()
  ]);
  const imageUrlsBySlot = new Map(participantSettings.imageUrlsBySlot);

  for (const slotNumber of REPO_MANAGED_PARTICIPANT_IMAGE_SLOTS) {
    imageUrlsBySlot.delete(slotNumber);
  }

  const participantRoster = buildParticipants({
    names: registeredDisplayNames,
    displayNamesBySlot: participantSettings.displayNamesBySlot,
    imageUrlsBySlot
  });
  const initialParticipantImageUrl = participantRoster[0]?.imageUrl;

  return (
    <>
      {initialParticipantImageUrl ? (
        <link rel="preload" as="image" href={initialParticipantImageUrl} fetchPriority="high" />
      ) : null}
      <Header showApplyCta={false} />
      <main id="top" className="participant-page">
        <ParticipantSelector participants={participantRoster} />
      </main>
      <Footer />
      <ScrollAnimations />
    </>
  );
}
