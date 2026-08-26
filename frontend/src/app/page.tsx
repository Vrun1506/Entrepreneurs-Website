import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import WhoWeAre from "@/components/WhoWeAre";
import Community from "@/components/Community";
import Opportunities from "@/components/Opportunities";
import Events from "@/components/Events";
import Apply from "@/components/Apply";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main id="main-content" tabIndex={-1} style={{ position: "relative", zIndex: 1 }}>
      <Navbar />
      <Hero />
      <WhoWeAre />
      <Community />
      <Opportunities />
      <Events />
      <Apply />
      <Footer />
    </main>
  );
}