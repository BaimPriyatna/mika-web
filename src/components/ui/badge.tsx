import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400",
        secondary: "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-400",
        destructive: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400",
        warning: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400",
        outline: "border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={`${badgeVariants({ variant })} ${className || ''}`} {...props} />
  )
}

export { Badge, badgeVariants }
