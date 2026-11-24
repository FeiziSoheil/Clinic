/**
 * ============================================================================
 * CLINICK — ICON REGISTRY
 * ============================================================================
 * Maps the string icon names used throughout the CMS content model to actual
 * Lucide icon components. Using an explicit registry (instead of dynamic lookup)
 * keeps the bundle tree-shakeable, the names type-checked, and lets us fall back
 * to a neutral glyph if a CMS editor types an unknown name.
 * ============================================================================
 */

import {
  Accessibility,
  Activity,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpDown,
  Award,
  Baby,
  BadgeCheck,
  BellRing,
  Bone,
  Brain,
  Building2,
  CalendarCheck,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  Car,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  CreditCard,
  DatabaseBackup,
  FileText,
  Fingerprint,
  Flower2,
  Globe,
  Heart,
  HeartHandshake,
  HeartPulse,
  HelpCircle,
  History,
  Hospital,
  Languages,
  type LucideIcon,
  Lightbulb,
  ListOrdered,
  Lock,
  LockKeyhole,
  MapPin,
  MessagesSquare,
  PhoneCall,
  Pill,
  QrCode,
  ReceiptText,
  Search,
  ServerCog,
  ShieldCheck,
  ShieldHalf,
  Smile,
  Sofa,
  Sparkles,
  Star,
  Stethoscope,
  TestTube2,
  Timer,
  TrendingUp,
  UserSearch,
  Users,
  Video,
  Wallet,
  Wifi,
  Zap,
} from "lucide-react";
import type { ComponentProps } from "react";

/**
 * Curated map of every icon name referenced by the content model. Add new
 * entries here when the CMS gains a new icon — the component stays closed for
 * modification everywhere else.
 */
const ICONS: Record<string, LucideIcon> = {
  Accessibility,
  Activity,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpDown,
  Award,
  Baby,
  BadgeCheck,
  BellRing,
  Bone,
  Brain,
  Building2,
  CalendarCheck,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  Car,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  CreditCard,
  DatabaseBackup,
  FileText,
  Fingerprint,
  Flower2,
  Globe,
  Heart,
  HeartHandshake,
  HeartPulse,
  History,
  Hospital,
  Languages,
  Lightbulb,
  ListOrdered,
  Lock,
  LockKeyhole,
  MapPin,
  MessagesSquare,
  PhoneCall,
  Pill,
  QrCode,
  ReceiptText,
  Search,
  ServerCog,
  ShieldCheck,
  ShieldHalf,
  Smile,
  Sofa,
  Sparkles,
  Star,
  Stethoscope,
  TestTube2,
  Timer,
  TrendingUp,
  UserSearch,
  Users,
  Video,
  Wallet,
  Wifi,
  Zap,
};

export interface IconProps extends ComponentProps<"svg"> {
  /** CMS icon name (PascalCase, matching the registry keys). */
  name: string;
}

/**
 * Render a Lucide icon by its registry name. Renders a neutral fallback glyph
 * when the name is missing/unknown so the UI never crashes on bad CMS data.
 */
export function Icon({ name, ...props }: IconProps) {
  const Cmp = ICONS[name] ?? HelpCircle;
  return <Cmp {...props} />;
}

/** Type guard / lookup used by callers that need the component directly. */
export function resolveIcon(name?: string): LucideIcon | undefined {
  if (!name) return undefined;
  return ICONS[name];
}
