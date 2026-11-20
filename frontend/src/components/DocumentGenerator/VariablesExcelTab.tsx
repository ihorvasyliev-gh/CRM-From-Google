import CustomVariablesPanel from './CustomVariablesPanel';
import ExcelColumnsPanel from './ExcelColumnsPanel';
import PlaceholderReferencePanel from './PlaceholderReferencePanel';
import type { ConfirmDelete, ShowToast } from './helpers';
import type { DocumentSetup } from './useDocumentSetup';

export interface VariablesExcelTabProps {
    setup: DocumentSetup;
    showToast: ShowToast;
    confirmDelete: ConfirmDelete;
    onOpenSettingsGeneral?: () => void;
}

/** Variables & Excel tab of the Documents section: custom variables, Participants.xlsx columns, and placeholder reference. */
export default function VariablesExcelTab({
    setup,
    showToast,
    confirmDelete,
    onOpenSettingsGeneral,
}: VariablesExcelTabProps) {
    return (
        <div className="max-w-6xl mx-auto w-full space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
                <CustomVariablesPanel setup={setup} showToast={showToast} confirmDelete={confirmDelete} />
                <ExcelColumnsPanel setup={setup} showToast={showToast} />
            </div>
            <PlaceholderReferencePanel customVars={setup.customVars} onOpenSettingsGeneral={onOpenSettingsGeneral} />
        </div>
    );
}
