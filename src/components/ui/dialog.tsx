import * as React from "react"
import { X } from "lucide-react"

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange?.(false)}
      />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          {children}
        </div>
      </div>
    </div>
  )
}

interface DialogContentProps {
  children: React.ReactNode
  className?: string
}

const DialogContent = ({ children, className = '' }: DialogContentProps) => {
  return (
    <div 
      className={`relative bg-white dark:bg-gray-950 rounded-lg shadow-lg w-full max-w-lg border border-gray-200 dark:border-gray-800 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

interface DialogHeaderProps {
  children: React.ReactNode
  onClose?: () => void
}

const DialogHeader = ({ children, onClose }: DialogHeaderProps) => {
  return (
    <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
      <div className="flex-1">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-4 rounded-md p-1 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      )}
    </div>
  )
}

interface DialogTitleProps {
  children: React.ReactNode
}

const DialogTitle = ({ children }: DialogTitleProps) => {
  return (
    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
      {children}
    </h2>
  )
}

interface DialogDescriptionProps {
  children: React.ReactNode
}

const DialogDescription = ({ children }: DialogDescriptionProps) => {
  return (
    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
      {children}
    </p>
  )
}

interface DialogBodyProps {
  children: React.ReactNode
  className?: string
}

const DialogBody = ({ children, className = '' }: DialogBodyProps) => {
  return (
    <div className={`p-6 ${className}`}>
      {children}
    </div>
  )
}

interface DialogFooterProps {
  children: React.ReactNode
}

const DialogFooter = ({ children }: DialogFooterProps) => {
  return (
    <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
      {children}
    </div>
  )
}

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
}
