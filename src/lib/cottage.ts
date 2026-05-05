/**
 * Cottage-specific configuration shared across the app.
 *
 * The "Cottage Elder Sponsor" is one of the senior Scheerer family members
 * who must vouch for any reservation. A request must list at least one;
 * the chosen names are snapshotted onto the resulting Reservation when
 * the admin approves, so the reservation details show the sponsor(s) for
 * the stay even if this list ever changes in the future.
 */
export const COTTAGE_ELDERS = [
  "Ben Scheerer",
  "Ann Scheerer",
  "Jack Scheerer",
] as const;

export type CottageElder = (typeof COTTAGE_ELDERS)[number];
