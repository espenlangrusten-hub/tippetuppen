import { requireAdmin } from "@/server/adminAuth";
import { dailyStats } from "@/server/analytics";
import { osloDateKey, addDays } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdmin();
  const today = osloDateKey();
  const days = (await dailyStats(addDays(today, -59), today)).reverse();
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-3xl font-bold uppercase">Analyse · siste 60 dager</h1>
      <p className="text-xs text-mist">Besøkende = unike anonyme daglige nøkler. Spill nr. 2 = andel som fullførte begge dagens spill blant dem som fullførte minst ett. Annonseinntekter leses i AdSense-konsollet.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-mist">
            <tr>
              <th>Dag</th>
              <th>Besøk</th>
              <th>Nye</th>
              <th>Sidevisn.</th>
              <th>Starter</th>
              <th>Fullført</th>
              <th>Mangler XI</th>
              <th>Målløs</th>
              <th>Begge</th>
              <th>Spill 2</th>
              <th>Delinger</th>
              <th>Arkiv</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} className="border-t border-line">
                <td className="py-1">{d.day}</td>
                <td>{d.visitors}</td>
                <td>{d.newVisitors}</td>
                <td>{d.pageViews}</td>
                <td>{d.starts}</td>
                <td>{d.completions}</td>
                <td>{d.mxiCompleters}</td>
                <td>{d.malCompleters}</td>
                <td>{d.bothCompleters}</td>
                <td>{d.secondGameRate != null ? `${d.secondGameRate}%` : "–"}</td>
                <td>{d.shares}</td>
                <td>{d.archive}</td>
              </tr>
            ))}
            {days.length === 0 && (
              <tr>
                <td colSpan={12} className="py-3 text-fog">
                  Ingen hendelser ennå.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
