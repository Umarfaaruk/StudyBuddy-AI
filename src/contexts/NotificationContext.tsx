import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, updateDoc, doc, writeBatch, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: "streak" | "quiz" | "badge" | "study" | "system";
  icon: string;
  read: boolean;
  created_at: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  addNotification: (data: Omit<Notification, "id" | "user_id" | "read" | "created_at">) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Real-time listener for notifications
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(db, "notifications"),
      where("user_id", "==", user.uid),
      orderBy("created_at", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: Notification[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Notification[];
      setNotifications(notifs);
    }, (error) => {
      console.error("[Notifications] Listener error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = useCallback(async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (error) {
      console.error("[Notifications] Mark as read error:", error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      notifications
        .filter((n) => !n.read)
        .forEach((n) => {
          batch.update(doc(db, "notifications", n.id), { read: true });
        });
      await batch.commit();
    } catch (error) {
      console.error("[Notifications] Mark all as read error:", error);
    }
  }, [user, notifications]);

  const addNotification = useCallback(async (data: Omit<Notification, "id" | "user_id" | "read" | "created_at">) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "notifications"), {
        ...data,
        user_id: user.uid,
        read: false,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Notifications] Add notification error:", error);
    }
  }, [user]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, addNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within NotificationProvider");
  return context;
};

/**
 * Standalone function to create a notification for a specific user.
 * Can be called from anywhere (outside React components).
 */
export async function createNotification(
  userId: string,
  data: { title: string; message: string; type: Notification["type"]; icon: string }
) {
  try {
    await addDoc(collection(db, "notifications"), {
      ...data,
      user_id: userId,
      read: false,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Notifications] createNotification error:", error);
  }
}
