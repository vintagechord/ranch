import ApplyForm from "@/app/components/ApplyForm";
import BankTransfer from "@/app/components/BankTransfer";
import FAQ from "@/app/components/FAQ";
import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import Hero from "@/app/components/Hero";
import PinnedCopy from "@/app/components/PinnedCopy";
import ProgramSection from "@/app/components/ProgramSection";
import ScheduleSection from "@/app/components/ScheduleSection";
import ScrollAnimations from "@/app/components/ScrollAnimations";
import VenueSection from "@/app/components/VenueSection";

export default function Home() {
  return (
    <>
      <Header />
      <main id="top">
        <Hero />
        <PinnedCopy />
        <VenueSection />
        <ProgramSection />
        <ScheduleSection />
        <ApplyForm />
        <BankTransfer />
        <FAQ />
      </main>
      <Footer />
      <ScrollAnimations />
    </>
  );
}
