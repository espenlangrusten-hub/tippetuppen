import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-line py-8 text-sm text-fog">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/om" className="hover:text-snow">
            Om Tippetuppen
          </Link>
          <Link href="/personvern" className="hover:text-snow">
            Personvern
          </Link>
          <Link href="/arkiv" className="hover:text-snow">
            Arkiv
          </Link>
          <Link href="/statistikk" className="hover:text-snow">
            Statistikk
          </Link>
        </div>
        <p>
          Nye spill hver dag kl. 00:00 norsk tid. Laget for norske fotballfans. Kampdata er hentet fra offentlige kamparkiver og merket med kildestatus.
        </p>
      </div>
    </footer>
  );
}
