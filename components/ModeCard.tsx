import Link from "next/link";
import styles from "@/components/ModeCard.module.css";

interface ModeCardProps {
  title: string;
  description: string;
  href: string;
  cta: string;
  meta?: string;
  highlightAction?: boolean;
}

export function ModeCard({ title, description, href, cta, meta, highlightAction = false }: ModeCardProps) {
  const actionClass = highlightAction ? `${styles.action} ${styles.actionHighlight}` : styles.action;

  return (
    <Link href={href} className={styles.card}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      {meta ? <p className={styles.meta}>{meta}</p> : null}
      <span className={actionClass}>{cta}</span>
    </Link>
  );
}
