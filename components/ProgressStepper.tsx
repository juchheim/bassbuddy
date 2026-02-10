import type { ToneSegment } from "@/lib/constants/testTrack";
import styles from "@/components/ProgressStepper.module.css";

interface ProgressStepperProps {
  schedule: ToneSegment[];
  elapsedSec: number;
}

export function ProgressStepper({ schedule, elapsedSec }: ProgressStepperProps) {
  return (
    <div className={styles.wrap}>
      {schedule.map((segment) => {
        const isDone = elapsedSec > segment.toneEndSec;
        const isActive = elapsedSec >= segment.toneStartSec && elapsedSec <= segment.toneEndSec;

        const className = [styles.item, isDone ? styles.itemDone : "", isActive ? styles.itemActive : ""]
          .filter(Boolean)
          .join(" ");

        return (
          <div key={`${segment.freqHz}-${segment.passIndex}-${segment.stepIndex}`} className={className}>
            {segment.freqHz} Hz{segment.passIndex > 0 ? ` (P${segment.passIndex + 1})` : ""}
          </div>
        );
      })}
    </div>
  );
}
