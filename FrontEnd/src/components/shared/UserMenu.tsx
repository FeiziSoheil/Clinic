"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { fullName } from "@/types/auth";

interface UserMenuProps {
  /**
   * When true, tightens spacing and truncates the display name so the control
   * fits a compact patient top bar on small screens.
   */
  compact?: boolean;
}

/**
 * Reusable user menu component.
 *
 * Displays the authenticated user's name together with a logout button. On
 * click it clears the persisted auth store and redirects to the login page.
 *
 * Intended for placement inside authenticated layout headers.
 */
export function UserMenu({ compact = false }: UserMenuProps) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  // Nothing to render if there is no authenticated user (e.g. rendered on a
  // public route before hydration resolves a logged-out state).
  if (!user) {
    return null;
  }

  const handleLogout = () => {
    // Clear the persisted user/token from the store.
    useAuthStore.getState().logout();
    router.replace("/login");
  };

  const displayName = fullName(user) || user.phone;

  return (
    <div className={cn("flex items-center", compact ? "gap-1.5" : "gap-3")}>
      <span
        className={cn(
          "font-medium text-foreground",
          compact
            ? "max-w-[7.5rem] truncate text-xs sm:max-w-[10rem] sm:text-sm"
            : "text-sm",
        )}
        title={displayName}
      >
        {displayName}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className={compact ? "size-10" : undefined}
        onClick={handleLogout}
        aria-label="خروج از حساب"
        title="خروج"
      >
        <LogOut className="size-5" />
      </Button>
    </div>
  );
}

export default UserMenu;
