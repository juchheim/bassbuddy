import Image from "next/image";
import Link from "next/link";
import styles from "@/components/AppBrand.module.css";

interface AppBrandProps {
  className?: string;
  priority?: boolean;
}

export function AppBrand({ className, priority = false }: AppBrandProps) {
  const classes = className ? `${styles.wrap} ${className}` : styles.wrap;

  return (
    <Link href="/" className={classes} aria-label="SubSpot home">
      <Image
        src="/branding/logos/subspot-logo.png"
        alt="SubSpot"
        width={1024}
        height={1024}
        priority={priority}
        className={styles.logo}
      />
    </Link>
  );
}
