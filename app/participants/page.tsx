import type { Metadata } from "next";
import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import ParticipantSelector from "@/app/components/ParticipantSelector";
import ScrollAnimations from "@/app/components/ScrollAnimations";
import { participants } from "@/lib/participants";

export const metadata: Metadata = {
  title: "참가자 | 목장의 아침",
  description: "목장의 아침 을왕리 에디션 참가자 캐릭터 선택 화면."
};

export default function ParticipantsPage() {
  return (
    <>
      <Header showApplyCta={false} />
      <main id="top" className="participant-page">
        <ParticipantSelector participants={participants} />
      </main>
      <Footer />
      <ScrollAnimations />
    </>
  );
}
