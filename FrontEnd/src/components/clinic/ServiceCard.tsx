import Link from "next/link";
import { Clock, ChevronLeft } from "lucide-react";

import type { Service } from "@/lib/content";
import { cn, toPersianDigits } from "@/lib/utils";
import { Icon } from "@/components/marketing/ui/icon";
import { Card, CardContent } from "@/components/ui/card";

export function ServiceCard({ service }: { service: Service }) {
  return (
    <Link href={`/services/${service.slug}`} className="block h-full">
      <Card
        className={cn(
          "h-full transition-colors hover:bg-muted/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        )}
      >
        <CardContent className="flex h-full flex-col gap-3 p-4">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon name={service.iconName} className="size-4" />
          </span>
          <h3 className="text-title-lg font-bold">{service.title}</h3>
          <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
            {service.description}
          </p>
          <div className="flex items-center justify-between border-t border-border pt-3 text-meta text-muted-foreground">
            <span className="flex items-center gap-1 tabular-nums">
              <Clock className="size-3.5" aria-hidden="true" />
              {toPersianDigits(service.durationMinutes.toString())} دقیقه
            </span>
            <span className="flex items-center gap-1 font-medium text-brand">
              پزشکان این خدمت
              <ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden="true" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function ServiceGrid({ services }: { services: Service[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((s) => (
        <ServiceCard key={s.slug} service={s} />
      ))}
    </div>
  );
}
