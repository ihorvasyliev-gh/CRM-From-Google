import type { HTMLAttributes } from 'react';
import { useListAnimation } from '../../hooks/useListAnimation';

/** A <ul> whose items fade in and out and slide into place when the list changes */
export default function AnimatedList(props: HTMLAttributes<HTMLUListElement>) {
    const ref = useListAnimation<HTMLUListElement>();
    return <ul ref={ref} {...props} />;
}
