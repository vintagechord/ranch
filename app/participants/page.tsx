import type { Metadata } from "next";
import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import ParticipantSelector from "@/app/components/ParticipantSelector";
import ScrollAnimations from "@/app/components/ScrollAnimations";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { applyParticipantNames } from "@/lib/participants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "참가자 | 목장의 아침",
  description: "목장의 아침 을왕리 에디션 참가자 캐릭터 선택 화면."
};

type ApplicationNameRow = {
  name: string | null;
};

function normalizeParticipantName(name: string | null) {
  return name?.trim().replace(/\s+/g, " ") ?? "";
}

function isExcludedParticipantName(name: string) {
  const lowerName = name.toLowerCase();

  return lowerName.includes("codex") || name === "테스트";
}

async function getRegisteredParticipantNames() {
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
    const names: string[] = [];

    for (const application of (data ?? []) as ApplicationNameRow[]) {
      const name = normalizeParticipantName(application.name);
      const nameKey = name.toLowerCase();

      if (!name || isExcludedParticipantName(name) || seenNames.has(nameKey)) {
        continue;
      }

      seenNames.add(nameKey);
      names.push(name);

      if (names.length === 16) {
        break;
      }
    }

    return names;
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

export default async function ParticipantsPage() {
  const registeredNames = await getRegisteredParticipantNames();
  const participantRoster = applyParticipantNames(registeredNames);

  return (
    <>
      <Header showApplyCta={false} />
      <main id="top" className="participant-page">
        <ParticipantSelector participants={participantRoster} />
      </main>
      <Footer />
      <ScrollAnimations />
    </>
  );
}
