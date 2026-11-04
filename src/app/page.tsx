import { Dock } from "@/components/landing/Dock";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Ledger } from "@/components/landing/Ledger";
import { Nav } from "@/components/landing/Nav";
import { Problem } from "@/components/landing/Problem";
import { QuorumDemo } from "@/components/landing/QuorumDemo";
import { UseCases } from "@/components/landing/UseCases";
import { ZoomGallery } from "@/components/landing/ZoomGallery";

export default function Home() {
  return (
    <>
      <noscript>
        <style>{`[data-reveal]{visibility:visible!important}`}</style>
      </noscript>
      <Nav />
      <Dock />
      <main>
        <Hero />
        <ZoomGallery />
        <Problem />
        <HowItWorks />
        <UseCases />
        <QuorumDemo />
        <Ledger />
      </main>
      <FinalCta />
      <Footer />
    </>
  );
}
