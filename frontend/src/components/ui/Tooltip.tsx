import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={`z-50 overflow-hidden rounded-md border border-border-subtle bg-surface-elevated px-3 py-1.5 text-xs font-medium text-primary shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ${className || ''}`}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref && typeof ref === 'object') (ref as React.MutableRefObject<T | null>).current = value;
}

// A simple wrapper for ease of use.
// The Radix tooltip is only mounted after the trigger is first hovered/focused: boards and tables
// render hundreds of these, and most are never used — this keeps initial renders light.
export function CustomTooltip({ children, content, side = "top" }: { children: React.ReactNode, content: React.ReactNode, side?: "top" | "right" | "bottom" | "left" }) {
  const [armed, setArmed] = React.useState<false | 'pointer' | 'focus'>(false);

  if (!content) return <>{children}</>;

  // Strip native `title` from child to prevent duplicate native OS/browser tooltips from overlaying Radix tooltips
  let triggerChild = children;
  if (React.isValidElement(children)) {
    const childProps = children.props as Record<string, any>;
    if (childProps.title !== undefined) {
      const { title } = childProps;
      // cloneElement merges props, so the native title must be explicitly cleared
      triggerChild = React.cloneElement(children as React.ReactElement<any>, {
        title: undefined,
        'aria-label': childProps['aria-label'] || (typeof title === 'string' ? title : undefined),
      });
    }
  }

  if (!armed && React.isValidElement(triggerChild)) {
    const childProps = triggerChild.props as Record<string, any>;
    return React.cloneElement(triggerChild as React.ReactElement<any>, {
      onPointerEnter: (e: React.PointerEvent) => {
        childProps.onPointerEnter?.(e);
        if (e.pointerType !== 'touch') setArmed('pointer');
      },
      onFocus: (e: React.FocusEvent) => {
        childProps.onFocus?.(e);
        // Only keyboard focus shows a tooltip (mouse focus is covered by pointer arming)
        if ((e.target as HTMLElement).matches?.(':focus-visible')) {
          setArmed('focus');
        }
      },
    });
  }

  // Arming swaps the element tree, which remounts the trigger — if it was armed by keyboard focus,
  // move focus onto the new node so keyboard users don't lose their place.
  if (armed === 'focus' && React.isValidElement(triggerChild)) {
    const originalRef = (triggerChild as any).ref;
    triggerChild = React.cloneElement(triggerChild as React.ReactElement<any>, {
      ref: (node: HTMLElement | null) => {
        assignRef(originalRef, node);
        if (node) {
          node.focus({ preventScroll: true });
          // Same tree shape from now on — no further remounts or refocusing
          setArmed('pointer');
        }
      },
    });
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip defaultOpen={armed === 'focus'}>
        <TooltipTrigger asChild>
          {triggerChild}
        </TooltipTrigger>
        <TooltipContent side={side}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
