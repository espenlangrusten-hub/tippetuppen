import { TodayCards } from "@/components/home/TodayCards";

export default function Home() {
  return (
    <div className="home-shell flex flex-col gap-7">
      <TodayCards />

      <section className="home-how-it-works" aria-labelledby="how-it-works-heading">
        <div>
          <p className="home-eyebrow">Spill på to minutter</p>
          <h2 id="how-it-works-heading" className="font-display text-3xl font-bold uppercase sm:text-4xl">Én ny utfordring hver dag</h2>
        </div>
        <div className="home-steps">
          <div><span>01</span><strong>Velg spill</strong><p>Mangler XI, Målløs eller Finn spilleren.</p></div>
          <div><span>02</span><strong>Sett dagens score</strong><p>Spill gratis og sammenlign resultatet ditt.</p></div>
          <div><span>03</span><strong>Klatre på tabellen</strong><p>Logg inn for å samle poeng gjennom måneden.</p></div>
        </div>
      </section>
    </div>
  );
}
