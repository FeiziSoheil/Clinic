import { cn } from "@/lib/utils"
import { SKELETON } from "@/lib/motion"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(SKELETON, "rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
