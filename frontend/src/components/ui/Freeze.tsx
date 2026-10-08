import { memo, type ReactNode } from 'react';

/**
 * Renders its children, but keeps the last ones on screen while `frozen`: a closing dialog
 * animates out with the content it had, although its parent usually clears that content's
 * data together with `open`.
 */
const Freeze = memo(
    function Freeze({ children }: { children: ReactNode; frozen: boolean }) {
        return children;
    },
    (_prev, next) => next.frozen
);

export default Freeze;
