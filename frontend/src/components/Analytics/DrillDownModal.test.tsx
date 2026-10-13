import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DrillDownModal from './DrillDownModal';

describe('DrillDownModal', () => {
    it('shows the extra actions of what it lists', () => {
        render(
            <DrillDownModal isOpen onClose={() => {}} title="SafePass - Ukrainian (08/10/2026) Graduates" data={[]} actions={<button type="button">Ignore in reports</button>} />,
        );
        // Header (wide screens) and the search row (small screens)
        expect(screen.getAllByRole('button', { name: 'Ignore in reports' }).length).toBeGreaterThan(0);
    });
});
