# Firebase Deployment Checklist & Rule Validation

**Project ID:** edunox-7e116  
**Date:** 2026-06-17  
**Status:** VALIDATED (Pending Production CLI Authentication)

---

## 1. Rules & Configuration Mapping

The [firebase.json](file:///d:/edunox90-main/firebase.json) file correctly maps local security configurations to your production Firebase deployment:
* **Firestore Rules:** Linked to [firestore.rules](file:///d:/edunox90-main/firestore.rules).
* **Firestore Indexes:** Linked to [firestore.indexes.json](file:///d:/edunox90-main/firestore.indexes.json).
* **Storage Rules:** Linked to [storage.rules](file:///d:/edunox90-main/storage.rules).

---

## 2. Firestore Security Rules Validation

All security rules in [firestore.rules](file:///d:/edunox90-main/firestore.rules) have been audited and verified for release safety:
* **Privilege Escalation Closed:** `/users` and `/profiles` collections restrict normal users from updating `is_admin` or `role` fields (only administrators can edit these).
* **User Identity Protection (IDOR):** Personal data collections (`lesson_progress`, `doubt_sessions`, `doubt_messages`, `saved_notes`, `parent_guidance`, and `user_preferences`) restrict read/write access strictly to the owner (`resource.data.user_id == request.auth.uid`) or active administrators.
* **Social Connections Security:** `/follows` collection ensures users can only create relationships as themselves and only delete their own follow edges.
* **Complaint & Bug Reporting Security:**
  * `/complaints/{complaintId}` allows users to read/write their own complaints, and limits deletion to `isAdmin()`.
  * `/complaint_history/{historyId}` restricts reads/writes to owners and administrators.

---

## 3. Storage Security Rules Validation

Rules in [storage.rules](file:///d:/edunox90-main/storage.rules) protect file uploads from quota-draining spam:
* **Profile Avatars (`/avatars/{userId}/*`):** Locked to the authenticated owner; files must be under 2MB and match `image/*` MIME type.
* **Study Materials (`/materials/{userId}/*`):** Locked to the authenticated owner; file size capped at 20MB.
* **Complaint Screenshots (`/complaints/{userId}/*`):** Authenticated users can upload screenshots under 5MB (restricted to image types) to support bug reports.

---

## 4. Index Configurations

The composite indexes configured in [firestore.indexes.json](file:///d:/edunox90-main/firestore.indexes.json) match the application query patterns:
* **Index:** `notifications` collection -> `user_id` (ASC) + `created_at` (DESC). Enables real-time order-by queries for user dashboards.
* **Other Collections:** Queries on `complaints` and `xp_logs` filter by single equality properties (e.g., `where("user_id", "==", uid)`), which leverage Firestore's automatic single-field indexes. No additional composite indexes are needed.

---

## 5. Emulator Compatibility

* Local emulator runs require **JDK version 21 or above** to support `firebase-tools`.
* Local Java installation was found at version `1.8.0` (Java 8), which will cause `firebase emulators:start` to halt until Java is upgraded to version 21+ on the developer's system.

---

## 6. Execution Command

Run this command in the project directory when ready to deploy:
```bash
firebase deploy --only firestore:rules,storage
```

> [!NOTE]
> Ensure you are authenticated first by executing `firebase login`.
