export const MULTI_SEAT_ORDER = ["center", "left", "right"] as const;

export type MultiSeatPosition = (typeof MULTI_SEAT_ORDER)[number];
export type MultiSeatPlacement = "A" | "B";

export interface MultiSeatLabelDef {
  placement: MultiSeatPlacement;
  seat: MultiSeatPosition;
  label: string;
}

const SEAT_TEXT: Record<MultiSeatPosition, string> = {
  center: "Center Seat",
  left: "Left Seat",
  right: "Right Seat"
};

export function multiSeatLabel(placement: MultiSeatPlacement, seat: MultiSeatPosition): string {
  return `Placement ${placement} - ${SEAT_TEXT[seat]}`;
}

export const MULTI_SEAT_LABELS: MultiSeatLabelDef[] = [
  { placement: "A", seat: "center", label: multiSeatLabel("A", "center") },
  { placement: "A", seat: "left", label: multiSeatLabel("A", "left") },
  { placement: "A", seat: "right", label: multiSeatLabel("A", "right") },
  { placement: "B", seat: "center", label: multiSeatLabel("B", "center") },
  { placement: "B", seat: "left", label: multiSeatLabel("B", "left") },
  { placement: "B", seat: "right", label: multiSeatLabel("B", "right") }
];

export function seatDisplayName(seat: MultiSeatPosition): string {
  return SEAT_TEXT[seat];
}
