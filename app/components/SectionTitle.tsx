import type { ReactNode } from "react";

type SectionTitleProps = {
  eyebrow: string;
  title: ReactNode;
  note?: string;
};

export default function SectionTitle({ eyebrow, title, note }: SectionTitleProps) {
  return (
    <div className="section-heading">
      <p className="section-eyebrow">{eyebrow}</p>
      <h2 data-section-title>{title}</h2>
      {note ? <p className="section-note">{note}</p> : null}
    </div>
  );
}
