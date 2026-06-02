const REPO_URL = "https://github.com/aboutcircles/embedded-miniapp-boilerplate"; // TODO: swap for the Dappcon Chat fork once published

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 text-sm text-ink-muted">
      <p className="border-t border-hairline pt-5 leading-relaxed">
        Feed posts and registration are stored in Neon Postgres and will be
        wiped 48h after the event finishes. DMs are encrypted via XMTP
        (rolling out).{" "}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="text-brand hover:text-brand-press"
        >
          Repo
        </a>
        .
      </p>
    </footer>
  );
}
