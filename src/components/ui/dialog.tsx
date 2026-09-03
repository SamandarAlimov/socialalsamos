import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { UI_LAYER } from "@/lib/uiLayers";

/**
 * Global modal stack:
 * page chrome/floating controls < backdrop < modal content.
 *
 * AppLayout collapse control z-[1300], xarita/create chrome ham shu diapazonda.
 * Modal backdrop ularning barchasini hira qiladi, content esa backdropdan yuqori.
 */
type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root>;

type PlatformScrollSnapshot = {
  overflow: string;
  overflowY: string;
  overscrollBehavior: string;
  touchAction: string;
  scrollbarGutter: string;
  scrollTop: number;
  scrollLeft: number;
};

let platformScrollLockCount = 0;
let lockedPlatformScrollRoot: HTMLElement | null = null;
let platformScrollSnapshot: PlatformScrollSnapshot | null = null;

function acquirePlatformScrollLock() {
  if (typeof document === 'undefined') return;

  platformScrollLockCount += 1;
  if (platformScrollLockCount !== 1) return;

  const root = document.querySelector<HTMLElement>('[data-platform-scroll-root="true"]');
  if (!root) return;

  lockedPlatformScrollRoot = root;
  platformScrollSnapshot = {
    overflow: root.style.overflow,
    overflowY: root.style.overflowY,
    overscrollBehavior: root.style.overscrollBehavior,
    touchAction: root.style.touchAction,
    scrollbarGutter: root.style.scrollbarGutter,
    scrollTop: root.scrollTop,
    scrollLeft: root.scrollLeft,
  };

  // Radix locks document/body scroll, but Alsamos pages scroll inside <main>.
  // Lock that canonical nested scroller too so iOS/Android cannot move the
  // feed behind a portal dialog while the user's finger is on the modal.
  root.style.overflow = 'hidden';
  root.style.overflowY = 'hidden';
  root.style.overscrollBehavior = 'none';
  root.style.touchAction = 'none';
  root.style.scrollbarGutter = 'stable';
  root.scrollTop = platformScrollSnapshot.scrollTop;
  root.scrollLeft = platformScrollSnapshot.scrollLeft;
  root.dataset.modalScrollLocked = 'true';
}

function releasePlatformScrollLock() {
  if (typeof document === 'undefined') return;

  platformScrollLockCount = Math.max(0, platformScrollLockCount - 1);
  if (platformScrollLockCount !== 0) return;

  const root = lockedPlatformScrollRoot;
  const snapshot = platformScrollSnapshot;

  lockedPlatformScrollRoot = null;
  platformScrollSnapshot = null;

  if (!root || !snapshot) return;

  root.style.overflow = snapshot.overflow;
  root.style.overflowY = snapshot.overflowY;
  root.style.overscrollBehavior = snapshot.overscrollBehavior;
  root.style.touchAction = snapshot.touchAction;
  root.style.scrollbarGutter = snapshot.scrollbarGutter;
  delete root.dataset.modalScrollLocked;

  // Restore the exact feed position after cancelling any mobile momentum.
  root.scrollTop = snapshot.scrollTop;
  root.scrollLeft = snapshot.scrollLeft;
}

function usePlatformDialogScrollLock(locked: boolean) {
  React.useEffect(() => {
    if (!locked) return;
    acquirePlatformScrollLock();
    return releasePlatformScrollLock;
  }, [locked]);
}

const Dialog = ({
  open,
  defaultOpen,
  onOpenChange,
  modal = true,
  ...props
}: DialogProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(Boolean(defaultOpen));
  const resolvedOpen = open ?? uncontrolledOpen;

  usePlatformDialogScrollLock(modal && resolvedOpen);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );

  return (
    <DialogPrimitive.Root
      {...props}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
      modal={modal}
    />
  );
};

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 touch-none overscroll-none bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      UI_LAYER.modalOverlay,
      className,
    )}
    onTouchStart={(event) => {
      onTouchStart?.(event);
      event.stopPropagation();
    }}
    onTouchMove={(event) => {
      onTouchMove?.(event);
      event.stopPropagation();
    }}
    onTouchEnd={(event) => {
      onTouchEnd?.(event);
      event.stopPropagation();
    }}
    onTouchCancel={(event) => {
      onTouchCancel?.(event);
      event.stopPropagation();
    }}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onWheel, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 overscroll-contain border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        UI_LAYER.modalContent,
        className,
      )}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        event.stopPropagation();
      }}
      onTouchMove={(event) => {
        onTouchMove?.(event);
        event.stopPropagation();
      }}
      onTouchEnd={(event) => {
        onTouchEnd?.(event);
        event.stopPropagation();
      }}
      onTouchCancel={(event) => {
        onTouchCancel?.(event);
        event.stopPropagation();
      }}
      onWheel={(event) => {
        onWheel?.(event);
        event.stopPropagation();
      }}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
