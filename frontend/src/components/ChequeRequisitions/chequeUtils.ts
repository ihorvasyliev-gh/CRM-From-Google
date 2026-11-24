export function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function clipboardFiles(data: DataTransfer | null): File[] {
    if (!data) return [];
    if (data.files && data.files.length > 0) return Array.from(data.files);
    const files: File[] = [];
    for (const item of Array.from(data.items ?? [])) {
        if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }
    return files;
}
