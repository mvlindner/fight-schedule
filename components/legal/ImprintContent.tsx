export default function ImprintContent() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Imprint</h1>
      <div className="mt-8 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
        <p>Name: Marco Lindner</p>
        <p>Location: Salzburg, Austria</p>
        <p>Email: marcovlindner@gmx.at</p>
        <p>This is a non-commercial project.</p>
      </div>
      <section className="mt-8 space-y-3 text-sm leading-7 text-neutral-700 dark:text-neutral-300">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Disclaimer
        </h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>All fight information is provided without guarantee.</li>
          <li>Fight cards and schedules are subject to change.</li>
          <li>We are not responsible for external websites linked on this site.</li>
        </ul>
      </section>
    </>
  );
}
