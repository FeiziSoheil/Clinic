import type { LucideIcon } from "lucide-react";

/**
 * Shared navigation item descriptor used by {@link Sidebar} and
 * {@link TopNavbar} to render a single route entry (icon + label + href).
 */
export interface NavItem {
  /** Route path the link points to. */
  href: string;
  /** Human-readable label shown next to the icon. */
  label: string;
  /**
   * Optional compact label for constrained chrome (e.g. patient bottom tabs).
   * Falls back to {@link label} when omitted.
   */
  shortLabel?: string;
  /** Lucide icon component rendered alongside the label. */
  icon: LucideIcon;
}
