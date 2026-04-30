import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";

/**
 * Single shared Amplify Data client. Phase 2+ pages will import this to
 * read/write Reservation, Request, etc. with full type safety.
 *
 * Usage example (Phase 2):
 *   const { data: reservations } = await client.models.Reservation.list();
 */
export const client = generateClient<Schema>();
