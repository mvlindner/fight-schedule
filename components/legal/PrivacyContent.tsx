type Props = {
  lastUpdated: string;
};

export default function PrivacyContent({ lastUpdated }: Props) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Privacy Policy</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Last updated: {lastUpdated}</p>

      <section className="mt-8 space-y-4 text-sm leading-7 text-neutral-700 dark:text-neutral-300">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          1. General Information
        </h2>
        <p>
          This website is a non-commercial project providing information about boxing events and
          fight schedules.
        </p>
        <p>
          Personal data is processed only to the extent necessary to ensure a functional and secure
          website.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm leading-7 text-neutral-700 dark:text-neutral-300">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          2. Responsible Party
        </h2>
        <p>Name: Marco Lindner</p>
        <p>Location: Salzburg, Austria</p>
        <p>Email: marcovlindner@gmx.at</p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-7 text-neutral-700 dark:text-neutral-300">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          3. Hosting and Server Log Files
        </h2>
        <p>
          The hosting provider of this website automatically collects and stores information in
          so-called server log files that your browser transmits automatically. These include:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>IP address</li>
          <li>Date and time of the request</li>
          <li>Browser type and version</li>
          <li>Operating system</li>
          <li>Referrer URL</li>
        </ul>
        <p>
          This data is used solely to ensure the stability and security of the website and cannot
          be directly assigned to specific individuals.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-7 text-neutral-700 dark:text-neutral-300">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          4. No User Accounts or Tracking
        </h2>
        <p>
          This website does not provide user accounts, does not use tracking tools, and does not
          analyze user behavior.
        </p>
        <p>No personal data is collected for marketing or analytics purposes.</p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-7 text-neutral-700 dark:text-neutral-300">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          5. External Links
        </h2>
        <p>
          This website contains links to external websites (e.g., event providers or broadcasters).
          We have no influence over the content of those websites and assume no liability for their
          privacy practices.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-7 text-neutral-700 dark:text-neutral-300">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          6. Cookies
        </h2>
        <p>
          This website does not use cookies that require consent. Only technically necessary
          processes may be used to ensure proper functionality.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-7 text-neutral-700 dark:text-neutral-300">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          7. Your Rights
        </h2>
        <p>Under the GDPR, you have the right to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Access your stored data</li>
          <li>Request correction or deletion</li>
          <li>Restrict processing</li>
          <li>Lodge a complaint with a supervisory authority</li>
        </ul>
        <p>
          Since this website does not actively store personal data, these rights generally apply
          only to server log data.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-7 text-neutral-700 dark:text-neutral-300">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          8. Contact
        </h2>
        <p>If you have any questions regarding data protection, you can contact:</p>
        <p>marcovlindner@gmx.at</p>
      </section>
    </>
  );
}
