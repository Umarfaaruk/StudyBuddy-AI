import { useState, useEffect, useRef } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { useNotifications } from "@/contexts/NotificationContext";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const NotificationPanel = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors border border-gray-100"
      >
        <Bell className="h-5 w-5 text-gray-500" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="absolute right-0 top-12 w-80 md:w-96 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="text-xs text-[#29ABE2] hover:underline font-medium flex items-center gap-1"
              >
                <Check className="h-3 w-3" />
                Mark all as read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <BellOff className="h-10 w-10 text-gray-200 mb-3" />
                <p className="text-sm text-gray-400 font-medium">No notifications yet</p>
                <p className="text-xs text-gray-300 mt-1">We'll notify you about important updates</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => {
                    if (!notif.read) markAsRead(notif.id);
                  }}
                  className={`w-full px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-50 last:border-0 text-left flex gap-3 ${
                    !notif.read ? "bg-[#29ABE2]/[0.02]" : ""
                  }`}
                >
                  {/* Unread indicator */}
                  <div className="flex-shrink-0 pt-0.5">
                    {!notif.read ? (
                      <div className="h-2 w-2 rounded-full bg-[#29ABE2] mt-1.5" />
                    ) : (
                      <div className="h-2 w-2 mt-1.5" />
                    )}
                  </div>
                  {/* Icon */}
                  <div className="h-9 w-9 rounded-xl bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">
                    {notif.icon}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm leading-tight ${!notif.read ? "font-semibold text-gray-900" : "font-medium text-gray-600"}`}>
                      {notif.title}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{notif.message}</div>
                    <div className="text-[10px] text-gray-300 mt-1 font-medium">{timeAgo(notif.created_at)}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationPanel;
