type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
};

export function PageTitle({ eyebrow, title, subtitle }: Props) {
  return (
    <div className="space-y-2">
      {eyebrow && (
        <p className="text-xs uppercase tracking-[0.14em] text-ink-muted">
          {eyebrow}
        </p>
      )}
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h1>
      {subtitle && <p className="text-base text-ink-muted">{subtitle}</p>}
    </div>
  );
}
