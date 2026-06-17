/**
 * FRIEND SYSTEM HELPERS
 * =====================
 * One canonical social graph in `friends_list`:
 *   { requester_id, addressee_id, status: "pending" | "accepted", created_at }
 *
 * Flow:
 *   X sends request to Y  → pending doc + notification to Y
 *   Y accepts             → status "accepted" + notification to X
 *   Both then see each other in their friends list (accepted records where
 *   the user is requester OR addressee).
 */
import { db } from "@/lib/firebase";
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc,
} from "firebase/firestore";
import { createNotification } from "@/contexts/NotificationContext";

export type FriendStatus = "none" | "pending_sent" | "pending_received" | "friends";

export interface FriendRecord {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
}

/** All friend_list records involving the user (both directions). */
export async function fetchFriendRecords(uid: string): Promise<FriendRecord[]> {
  const [sent, received] = await Promise.all([
    getDocs(query(collection(db, "friends_list"), where("requester_id", "==", uid))),
    getDocs(query(collection(db, "friends_list"), where("addressee_id", "==", uid))),
  ]);
  const map = new Map<string, FriendRecord>();
  for (const d of [...sent.docs, ...received.docs]) {
    map.set(d.id, { id: d.id, ...(d.data() as any) });
  }
  return [...map.values()];
}

/** Relationship of `uid` to `otherUid` given the user's records. */
export function friendStatusFor(records: FriendRecord[], uid: string, otherUid: string): {
  status: FriendStatus;
  recordId?: string;
} {
  const rec = records.find(
    (r) =>
      (r.requester_id === uid && r.addressee_id === otherUid) ||
      (r.requester_id === otherUid && r.addressee_id === uid)
  );
  if (!rec) return { status: "none" };
  if (rec.status === "accepted") return { status: "friends", recordId: rec.id };
  if (rec.requester_id === uid) return { status: "pending_sent", recordId: rec.id };
  return { status: "pending_received", recordId: rec.id };
}

/** X → Y friend request (idempotent: won't duplicate an existing relationship). */
export async function sendFriendRequest(
  fromUid: string,
  fromName: string,
  toUid: string
): Promise<"sent" | "exists" | "self"> {
  if (!fromUid || !toUid || fromUid === toUid) return "self";
  const records = await fetchFriendRecords(fromUid);
  const { status } = friendStatusFor(records, fromUid, toUid);
  if (status !== "none") return "exists";

  await addDoc(collection(db, "friends_list"), {
    requester_id: fromUid,
    addressee_id: toUid,
    status: "pending",
    created_at: new Date().toISOString(),
  });
  await createNotification(toUid, {
    title: "New friend request",
    message: `${fromName || "Someone"} sent you a friend request.`,
    type: "system",
    icon: "user-plus",
  }, fromUid);
  return "sent";
}

/** Y accepts X's request → notify X. */
export async function acceptFriendRequest(
  recordId: string,
  accepterName: string,
  requesterUid: string,
  accepterUid: string
): Promise<void> {
  await updateDoc(doc(db, "friends_list", recordId), { status: "accepted" });
  await createNotification(requesterUid, {
    title: "Friend request accepted",
    message: `${accepterName || "Someone"} accepted your friend request.`,
    type: "system",
    icon: "user-check",
  }, accepterUid);
}

/** Remove/cancel/decline a relationship (delete the record). */
export async function removeFriendRecord(recordId: string): Promise<void> {
  await deleteDoc(doc(db, "friends_list", recordId));
}
