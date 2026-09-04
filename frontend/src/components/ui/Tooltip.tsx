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

// A simple wrapper for ease of use
export function CustomTooltip({ children, content, side = "top" }: { children: React.ReactNode, content: React.ReactNode, side?: "top" | "right" | "bottom" | "left" }) {
  if (!content) return <>{children}</>;

  // Strip native `title` from child to prevent duplicate native OS/browser tooltips from overlaying Radix tooltips
  let triggerChild = children;
  if (React.isValidElement(children)) {
    const childProps = children.props as Record<string, any>;
    if (childProps.title !== undefined) {
      const { title, ...restProps } = childProps;
      triggerChild = React.cloneElement(children, {
        ...restProps,
        'aria-label': childProps['aria-label'] || (typeof title === 'string' ? title : undefined),
      });
    }
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
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
