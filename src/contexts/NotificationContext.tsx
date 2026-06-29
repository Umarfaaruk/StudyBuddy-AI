import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/lib/supabase";
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

  // Initial fetch + realtime subscription (replaces Firestore onSnapshot).
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    let active = true;

    const load = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.uid)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("[Notifications] load error:", error);
        return;
      }
      if (active) setNotifications((data ?? []) as Notification[]);
    };

    load();

    const channel = supabase
      .channel(`notifications:${user.uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.uid}` },
        () => { load(); }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = useCallback(async (id: string) => {
    const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
    if (error) console.error("[Notifications] Mark as read error:", error);
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.uid)
      .eq("read", false);
    if (error) console.error("[Notifications] Mark all as read error:", error);
  }, [user]);

  const addNotification = useCallback(async (data: Omit<Notification, "id" | "user_id" | "read" | "created_at">) => {
    if (!user) return;
    const { error } = await supabase.from("notifications").insert({
      ...data,
      user_id: user.uid,
      read: false,
    });
    if (error) console.error("[Notifications] Add notification error:", error);
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
 * Standalone helper to create a notification for a specific user.
 * Can be called from anywhere (outside React components).
 */
export async function createNotification(
  userId: string,
  data: { title: string; message: string; type: Notification["type"]; icon: string },
  fromUserId?: string
) {
  const payload: Record<string, unknown> = {
    ...data,
    user_id: userId,
    read: false,
  };
  if (fromUserId && fromUserId !== userId) {
    payload.from_user_id = fromUserId;
  }
  const { error } = await supabase.from("notifications").insert(payload);
  if (error) console.error("[Notifications] createNotification error:", error);
}
