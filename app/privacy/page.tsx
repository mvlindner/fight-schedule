export const dynamic = "force-static";

import PrivacyContent from "@/components/legal/PrivacyContent";

const LAST_UPDATED = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date());

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-neutral-900 dark:text-neutral-100">
      <PrivacyContent lastUpdated={LAST_UPDATED} />
    </main>
  );
}
