/**
 * The place in the owner's hand for a card picked from the fan. The fan shows their hand from
 * across the table, mirrored, so their leftmost card (place 0) is the drawer's rightmost.
 */
export function ownerPlace(count: number, picked: number): number {
  return count - 1 - picked
}
