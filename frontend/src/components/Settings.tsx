import { useState, useCallback } from 'react';
import { Settings as SettingsIcon, Mail, Calendar, RotateCcw, Save, Eye, EyeOff, Info, AlertTriangle, Briefcase } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { getConfig, setConfig, resetConfig, buildEmailBodyHtml, buildEmailSubject, buildStatusEmailBodyHtml, type AppConfig } from '../lib/appConfig';

const quillModules = {
    toolbar: [
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['link'],
        ['clean'],
        [{ 'font': [] }],
        [{ 'color': [] }, { 'background': [] }],
    ]
};

export default function Settings() {
    const [config, setLocalConfig] = useState<AppConfig>(getConfig);
    const [saved, setSaved] = useState(false);
    const [showPreview, setShowPreview] = useState(true);

    const isValidTemplate = config.htmlEmailTemplate.includes('{confirmationLink}') || config.htmlEmailTemplate.includes('{confirmationButton}');
    const isValidStatusTemplate = config.statusEmailTemplate.includes('{statusLink}') || config.statusEmailTemplate.includes('{statusButton}');

    const handleSave = useCallback(() => {
        if (!isValidTemplate || !isValidStatusTemplate) return;
        setConfig(config);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, [config, isValidTemplate, isValidStatusTemplate]);

    const handleReset = useCallback(() => {
        const defaults = resetConfig();
        setLocalConfig(defaults);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, []);

    const hasChanges = JSON.stringify(config) !== JSON.stringify(getConfig());
    const canSave = hasChanges && isValidTemplate && isValidStatusTemplate;

    // Preview with sample data
    const linkStr = 'https://example.com/confirm?course_id=abc123&date=2026-03-15';
    const previewBody = buildEmailBodyHtml('Introduction to Digital Skills', '15 Mar 2026', linkStr, config);
    const previewSubject = buildEmailSubject('Introduction to Digital Skills', '15 Mar 2026', config);

    // Status template preview
    const statusLinkStr = 'https://forms.gle/5ernSprvAbq4MTgf9';
    const statusPreviewBody = buildStatusEmailBodyHtml(statusLinkStr, config);

    const [showStatusPreview, setShowStatusPreview] = useState(true);

    return (
        <div className="space-y-6 pb-8 w-full animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-brand-500/10 rounded-xl text-brand-500 dark:text-brand-400">
                        <SettingsIcon size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-primary tracking-tight">Settings</h2>
                        <p className="text-xs text-muted">Configure email templates and display preferences</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted hover:text-danger bg-surface-elevated hover:bg-danger/10 border border-border-subtle rounded-xl transition-all"
                    >
                        <RotateCcw size={14} />
                        Reset
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!canSave}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all ${saved
                            ? 'bg-success/20 text-success border border-success/30'
                            : canSave
                                ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-md shadow-brand-500/20'
                                : 'bg-surface-elevated text-muted border border-border-subtle cursor-not-allowed'
                            }`}
                    >
                        <Save size={14} />
                        {saved ? 'Saved!' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* ═══ Course Invitation Email Settings ═══ */}
            <section className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="px-5 py-4 border-b border-border-subtle bg-surface-elevated/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-brand-500/10 rounded-lg">
                            <Mail size={16} className="text-brand-500 dark:text-brand-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-primary">Course Invitation Email</h3>
                            <p className="text-xs text-muted mt-0.5">Configure email subject and body template sent to invited students</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowPreview(!showPreview)}
                        className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary px-2.5 py-1.5 rounded-lg hover:bg-surface-elevated transition-all"
                    >
                        {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                        {showPreview ? 'Hide' : 'Preview'}
                    </button>
                </div>

                <div className={`p-5 grid grid-cols-1 ${showPreview ? 'xl:grid-cols-2' : ''} gap-6`}>
                    <div className="space-y-4">
                        {/* Subject Editing */}
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Email Subject</label>
                            <input
                                type="text"
                                value={config.emailSubjectFormat}
                                onChange={e => setLocalConfig({ ...config, emailSubjectFormat: e.target.value })}
                                className="w-full px-4 py-2.5 bg-background border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all text-primary placeholder:text-muted/40"
                                placeholder="e.g. You are Invited to join our {courseName} course"
                            />
                            <div className="flex items-start gap-2 p-3 bg-surface-elevated/50 border border-border-subtle rounded-xl">
                                <Info size={14} className="text-muted mt-0.5 flex-shrink-0" />
                                <p className="text-[11px] text-muted leading-relaxed">
                                    Subject placeholders: <code className="px-1.5 py-0.5 bg-background rounded font-mono text-primary">{'{courseName}'}</code> — course name, <code className="px-1.5 py-0.5 bg-background rounded font-mono text-primary">{'{date}'}</code> — invite date
                                </p>
                            </div>
                        </div>

                        {/* Body Editing */}
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Email Body</label>
                            <div className="flex items-start gap-2 p-3 bg-surface-elevated/50 border border-border-subtle rounded-xl mb-2">
                                <Info size={14} className="text-muted mt-0.5 flex-shrink-0" />
                                <p className="text-[11px] text-muted leading-relaxed">
                                    Body placeholders: <code className="px-1.5 py-0.5 bg-background rounded font-mono text-primary">{'{courseDetails}'}</code> — styled course details card, <code className="px-1.5 py-0.5 bg-background rounded font-mono text-primary">{'{confirmationButton}'}</code> — styled confirm button
                                </p>
                            </div>
                            <div className="w-full bg-background border border-border-strong rounded-xl text-sm focus-within:ring-2 focus-within:ring-brand-500/50 focus-within:border-brand-500 transition-all text-primary [&_.ql-toolbar]:bg-surface-elevated/50 [&_.ql-toolbar]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-border-subtle [&_.ql-toolbar]:rounded-t-xl [&_.ql-container]:border-none [&_.ql-container]:rounded-b-xl [&_.ql-editor]:min-h-[250px] [&_.ql-editor]:max-h-[500px] [&_.ql-editor]:overflow-y-auto [&_.ql-editor]:p-4 [&_.ql-stroke]:stroke-primary dark:[&_.ql-stroke]:stroke-white [&_.ql-fill]:fill-primary dark:[&_.ql-fill]:fill-white [&_.ql-picker]:text-primary dark:[&_.ql-picker]:text-white">
                                <ReactQuill 
                                    theme="snow"
                                    value={config.htmlEmailTemplate}
                                    onChange={(content) => {
                                        if (content !== config.htmlEmailTemplate) {
                                            setLocalConfig(prev => ({ ...prev, htmlEmailTemplate: content }));
                                        }
                                    }}
                                    modules={quillModules}
                                />
                            </div>
                        </div>

                        {!isValidTemplate && (
                            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm animate-fadeIn">
                                <AlertTriangle size={16} className="flex-shrink-0" />
                                <span><strong>Warning:</strong> Template must include confirmation tag (<code>{'{confirmationButton}'}</code> or <code>{'{confirmationLink}'}</code>).</span>
                            </div>
                        )}
                    </div>

                    {/* Preview */}
                    {showPreview && (
                        <div className="space-y-3 animate-fadeIn h-full flex flex-col min-w-0">
                            <div className="text-xs font-bold text-muted uppercase tracking-wider">Live Preview</div>
                            <div className="p-4 bg-background border border-border-subtle rounded-xl flex-1 flex flex-col">
                                <div className="text-xs text-muted mb-2">
                                    <span className="font-semibold">Subject: </span>
                                    <span className="text-primary">{previewSubject}</span>
                                </div>
                                <hr className="border-border-subtle mb-3" />
                                <iframe
                                    srcDoc={previewBody}
                                    title="Email Invitation Preview"
                                    className="w-full flex-1 min-h-[500px] max-h-[600px] border border-border-subtle rounded-xl bg-[#f4f7f6]"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* ═══ Graduate Outcomes Survey Email ═══ */}
            <section className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="px-5 py-4 border-b border-border-subtle bg-surface-elevated/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-violet-500/10 rounded-lg">
                            <Briefcase size={16} className="text-violet-500" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-primary">Graduate Outcomes Survey Email</h3>
                            <p className="text-xs text-muted mt-0.5">Configure email subject and body template sent to graduates for employment tracking</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowStatusPreview(!showStatusPreview)}
                        className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary px-2.5 py-1.5 rounded-lg hover:bg-surface-elevated transition-all"
                    >
                        {showStatusPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                        {showStatusPreview ? 'Hide' : 'Preview'}
                    </button>
                </div>

                <div className={`p-5 grid grid-cols-1 ${showStatusPreview ? 'xl:grid-cols-2' : ''} gap-6`}>
                    <div className="space-y-4">
                        {/* Subject Editing */}
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Email Subject</label>
                            <input
                                type="text"
                                value={config.statusEmailSubjectFormat}
                                onChange={e => setLocalConfig({ ...config, statusEmailSubjectFormat: e.target.value })}
                                className="w-full px-4 py-2.5 bg-background border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all text-primary placeholder:text-muted/40"
                                placeholder="e.g. Quick Status Update — How are things going?"
                            />
                        </div>

                        {/* Body Editing */}
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Email Body</label>
                            <div className="flex items-start gap-2 p-3 bg-surface-elevated/50 border border-border-subtle rounded-xl mb-2">
                                <Info size={14} className="text-muted mt-0.5 flex-shrink-0" />
                                <p className="text-[11px] text-muted leading-relaxed">
                                    Body placeholders: <code className="px-1.5 py-0.5 bg-background rounded font-mono text-primary">{'{statusButton}'}</code> — styled action button, <code className="px-1.5 py-0.5 bg-background rounded font-mono text-primary">{'{statusLink}'}</code> — raw update URL
                                </p>
                            </div>
                            <div className="w-full bg-background border border-border-strong rounded-xl text-sm focus-within:ring-2 focus-within:ring-violet-500/50 focus-within:border-violet-500 transition-all text-primary [&_.ql-toolbar]:bg-surface-elevated/50 [&_.ql-toolbar]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-border-subtle [&_.ql-toolbar]:rounded-t-xl [&_.ql-container]:border-none [&_.ql-container]:rounded-b-xl [&_.ql-editor]:min-h-[200px] [&_.ql-editor]:max-h-[400px] [&_.ql-editor]:overflow-y-auto [&_.ql-editor]:p-4 [&_.ql-stroke]:stroke-primary dark:[&_.ql-stroke]:stroke-white [&_.ql-fill]:fill-primary dark:[&_.ql-fill]:fill-white [&_.ql-picker]:text-primary dark:[&_.ql-picker]:text-white">
                                <ReactQuill
                                    theme="snow"
                                    value={config.statusEmailTemplate}
                                    onChange={(content) => {
                                        if (content !== config.statusEmailTemplate) {
                                            setLocalConfig(prev => ({ ...prev, statusEmailTemplate: content }));
                                        }
                                    }}
                                    modules={quillModules}
                                />
                            </div>
                        </div>

                        {!isValidStatusTemplate && (
                            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm animate-fadeIn">
                                <AlertTriangle size={16} className="flex-shrink-0" />
                                <span><strong>Warning:</strong> Template must include at least one status tag (<code>{'{statusButton}'}</code> or <code>{'{statusLink}'}</code>).</span>
                            </div>
                        )}
                    </div>

                    {/* Preview */}
                    {showStatusPreview && (
                        <div className="space-y-3 animate-fadeIn h-full flex flex-col min-w-0">
                            <div className="text-xs font-bold text-muted uppercase tracking-wider">Live Preview</div>
                            <div className="p-4 bg-background border border-border-subtle rounded-xl flex-1 flex flex-col">
                                <div className="text-xs text-muted mb-2">
                                    <span className="font-semibold">Subject: </span>
                                    <span className="text-primary">{config.statusEmailSubjectFormat}</span>
                                </div>
                                <hr className="border-border-subtle mb-3" />
                                <iframe
                                    srcDoc={statusPreviewBody}
                                    title="Status Survey Preview"
                                    className="w-full flex-1 min-h-[500px] max-h-[500px] border border-border-subtle rounded-xl bg-[#f4f7f6]"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* ═══ Display Preferences ═══ */}
            <section className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="px-5 py-4 border-b border-border-subtle bg-surface-elevated/50">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-success/10 rounded-lg">
                            <Calendar size={16} className="text-success" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-primary">General Preferences</h3>
                            <p className="text-xs text-muted mt-0.5">Customize how dates and data are displayed</p>
                        </div>
                    </div>
                </div>
                <div className="p-5 space-y-6">
                    <div>
                        <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Date Format</label>
                        <select
                            value={config.dateFormat}
                            onChange={e => setLocalConfig({ ...config, dateFormat: e.target.value as AppConfig['dateFormat'] })}
                            className="w-full sm:w-64 px-4 py-2.5 bg-background border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all text-primary appearance-none cursor-pointer"
                        >
                            <option value="en-IE">DD MMM YYYY (e.g. 02 Mar 2026)</option>
                            <option value="en-US">MMM DD, YYYY (e.g. Mar 02, 2026)</option>
                            <option value="ISO">YYYY-MM-DD (e.g. 2026-03-02)</option>
                        </select>
                    </div>
                    <div>
                        <label className="flex items-center gap-3 cursor-pointer group w-max">
                            <div className="relative flex items-center justify-center">
                                <input
                                    type="checkbox"
                                    checked={config.includeLogosInEmails ?? true}
                                    onChange={e => setLocalConfig({ ...config, includeLogosInEmails: e.target.checked })}
                                    className="peer sr-only"
                                />
                                <div className="w-10 h-6 bg-surface-elevated border border-border-strong rounded-full peer-checked:bg-brand-500 peer-checked:border-brand-500 transition-colors"></div>
                                <div className="absolute left-1 top-1 w-4 h-4 bg-muted rounded-full peer-checked:bg-white peer-checked:translate-x-4 transition-transform shadow-sm"></div>
                            </div>
                            <div>
                                <span className="text-sm font-semibold text-primary group-hover:text-brand-500 transition-colors">Include Logos in Emails</span>
                                <p className="text-xs text-muted mt-0.5">Show the Cork City Partnership logo banner at the top of all emails.</p>
                            </div>
                        </label>
                    </div>
                </div>
            </section>

            {/* ═══ Info Footer ═══ */}
            <div className="flex items-center gap-2 text-xs text-muted px-1">
                <Info size={12} />
                <span>Settings are saved locally in your browser and will persist across sessions.</span>
            </div>
        </div>
    );
}
