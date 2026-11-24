import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import { pickLocalized } from "@/lib/marketing/locale";
import type { CTA, Locale } from "@/lib/marketing/types";
import type { VariantProps } from "class-variance-authority";

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

/**
 * ============================================================================
 * CLINICK — CTA LINK
 * ============================================================================
 * Renders a CMS-driven {@link CTA} as a properly-accessible link styled with
 * the shared shadcn button variants. Larger marketing sizes (via className)
 * keep CTAs prominent, and the trailing arrow flips automatically for RTL.
 * ============================================================================
 */

export interface CTALinkProps {
  cta: CTA;
  locale: Locale;
  variant?: ButtonVariant;
  className?: string;
  /** Icon placement; "end" follows the reading direction for the trailing arrow. */
  withArrow?: boolean;
  size?: "default" | "lg";
}

export function CTALink({
  cta,
  locale,
  variant = "default",
  className,
  withArrow = false,
  size = "lg",
}: CTALinkProps) {
  const label = pickLocalized(cta.label, locale);
  const isExternal = /^https?:|^tel:|^mailto:/i.test(cta.href);

  const content = (
    <>
      {cta.icon ? (
        <Icon name={cta.icon} className="size-4 rtl:ml-0.5 ltr:mr-0.5" />
      ) : null}
      <span>{label}</span>
      {withArrow ? (
        // Arrow points left in RTL, right in LTR (follows reading direction).
        <ArrowLeft className="size-4 rotate-180 rtl:rotate-0 transition-transform duration-300 group-hover/cta:-translate-x-0.5 rtl:group-hover/cta:translate-x-0.5" />
      ) : null}
    </>
  );

  const classes = cn(
    buttonVariants({ variant }),
    size === "lg"
      ? "h-12 rounded-xl px-6 text-[0.95rem]"
      : "h-10 rounded-lg px-4 text-sm",
    "group/cta shadow-sm",
    className,
  );

  if (isExternal) {
    return (
      <a href={cta.href} className={classes} data-cursor="hover">
        {content}
      </a>
    );
  }

  return (
    <Link href={cta.href} className={classes} data-cursor="hover">
      {content}
    </Link>
  );
}
