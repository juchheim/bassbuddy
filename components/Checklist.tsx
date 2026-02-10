import styles from "@/components/Checklist.module.css";

export interface ChecklistItem {
  id: string;
  label: string;
}

interface ChecklistProps {
  items: ChecklistItem[];
  values: Record<string, boolean>;
  onToggle: (id: string, checked: boolean) => void;
}

export function Checklist({ items, values, onToggle }: ChecklistProps) {
  return (
    <div className={styles.wrap}>
      {items.map((item) => (
        <label className={styles.item} key={item.id}>
          <input
            type="checkbox"
            checked={Boolean(values[item.id])}
            onChange={(event) => onToggle(item.id, event.target.checked)}
          />
          <span className={styles.label}>{item.label}</span>
        </label>
      ))}
    </div>
  );
}
