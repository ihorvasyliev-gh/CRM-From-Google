import { useState, useCallback } from 'react';
import { Settings as SettingsIcon, Mail, Type, Calendar, RotateCcw, Save, Eye, EyeOff, Info, AlertTriangle, Briefcase } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { getConfig, setConfig, resetConfig, type AppConfig } from '../lib/appConfig';

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
    const buttonHtml = `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${linkStr}" style="height:56px;v-text-anchor:middle;width:280px;" arcsize="15%" stroke="f" fillcolor="#2563eb">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Confirm My Place</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${linkStr}" target="_blank" style="display:inline-block;padding:16px 36px;background-color:#2563eb;color:#ffffff;font-size:18px;font-weight:700;text-decoration:none;border-radius:12px;box-shadow:0 4px 6px -1px rgba(37,99,235,0.2), 0 2px 4px -1px rgba(37,99,235,0.1);letter-spacing:0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">Confirm My Place</a>
<!--<![endif]-->`;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const originRegex = new RegExp(escapeRegExp(origin), 'g');

    const previewBody = config.htmlEmailTemplate
        .replace(/\{origin\}/g, origin)
        .replace(/\{courseTitle\}/g, 'Introduction to Digital Skills')
        .replace(/\{date\}/g, '15 Mar 2026')
        .replace(/\{confirmationLink\}/g, linkStr)
        .replace(/\{confirmationButton\}/g, buttonHtml);

    const previewSubject = config.emailSubjectFormat
        .replace(/\{courseName\}/g, 'Introduction to Digital Skills')
        .replace(/\{date\}/g, '15 Mar 2026');

    // Status template preview
    const statusLinkStr = 'https://forms.gle/5ernSprvAbq4MTgf9';
    const statusButtonHtml = `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${statusLinkStr}" style="height:56px;v-text-anchor:middle;width:280px;" arcsize="15%" stroke="f" fillcolor="#7c3aed">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Update My Status</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${statusLinkStr}" target="_blank" style="display:inline-block;padding:16px 36px;background-color:#7c3aed;color:#ffffff;font-size:18px;font-weight:700;text-decoration:none;border-radius:12px;box-shadow:0 4px 6px -1px rgba(124,58,237,0.2), 0 2px 4px -1px rgba(124,58,237,0.1);letter-spacing:0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">Update My Status</a>
<!--<![endif]-->`;
    const statusPreviewBody = config.statusEmailTemplate
        .replace(/\{origin\}/g, origin)
        .replace(/\{statusLink\}/g, statusLinkStr)
        .replace(/\{statusButton\}/g, statusButtonHtml);

    const [showStatusPreview, setShowStatusPreview] = useState(true);

    return (
        <div className="space-y-6 pb-8 max-w-5xl">
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

            {/* ═══ Email Template ═══ */}
            <section className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="px-5 py-4 border-b border-border-subtle bg-surface-elevated/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-info/10 rounded-lg">
                            <Mail size={16} className="text-info" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-primary">Email Template</h3>
                            <p className="text-xs text-muted mt-0.5">Customize the invitation email body</p>
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
                        {/* Placeholder hints */}
                        <div className="flex items-start gap-2 p-3 bg-info/5 border border-info/10 rounded-xl">
                            <Info size={14} className="text-info mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-muted leading-relaxed">
                                Available placeholders: <code className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono text-primary">{'{courseTitle}'}</code> — course name,{' '}
                                <code className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono text-primary">{'{date}'}</code> — invite date,{' '}
                                <code className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono text-primary">{'{confirmationLink}'}</code> — raw URL,{' '}
                                <code className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono text-primary">{'{confirmationButton}'}</code> — styled HTML button
                            </p>
                        </div>

                        <div className="w-full bg-background border border-border-strong rounded-xl text-sm focus-within:ring-2 focus-within:ring-brand-500/50 focus-within:border-brand-500 transition-all text-primary [&_.ql-toolbar]:bg-surface-elevated/50 [&_.ql-toolbar]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-border-subtle [&_.ql-toolbar]:rounded-t-xl [&_.ql-container]:border-none [&_.ql-container]:rounded-b-xl [&_.ql-editor]:min-h-[250px] [&_.ql-editor]:max-h-[500px] [&_.ql-editor]:overflow-y-auto [&_.ql-editor]:p-4 [&_.ql-stroke]:stroke-primary dark:[&_.ql-stroke]:stroke-white [&_.ql-fill]:fill-primary dark:[&_.ql-fill]:fill-white [&_.ql-picker]:text-primary dark:[&_.ql-picker]:text-white">
                            <ReactQuill 
                                theme="snow"
                                value={config.htmlEmailTemplate.replace(/\{origin\}/g, origin)}
                                onChange={(content) => {
                                    const cleanContent = content.replace(originRegex, '{origin}');
                                    if (cleanContent !== config.htmlEmailTemplate) {
                                        setLocalConfig(prev => ({ ...prev, htmlEmailTemplate: cleanContent }));
                                    }
                                }}
                                modules={quillModules}
                            />
                        </div>

                        {!isValidTemplate && (
                            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm animate-fadeIn">
                                <AlertTriangle size={16} className="flex-shrink-0" />
                                <span><strong>Warning:</strong> Template must include at least one confirmation tag (<code>{'{confirmationButton}'}</code> or <code>{'{confirmationLink}'}</code>).</span>
                            </div>
                        )}
                    </div>

                    {/* Preview */}
                    {showPreview && (
                        <div className="space-y-3 animate-fadeIn h-full">
                            <div className="text-xs font-bold text-muted uppercase tracking-wider">Live Preview</div>
                            <div className="p-4 bg-background border border-border-subtle rounded-xl">
                                <div className="text-xs text-muted mb-2">
                                    <span className="font-semibold">Subject: </span>
                                    <span className="text-primary">{previewSubject}</span>
                                </div>
                                <hr className="border-border-subtle mb-3" />
                                <div className="bg-white text-gray-900 rounded-lg overflow-hidden border border-border-subtle p-6 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-brand-500 [&_a]:underline [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_p]:mb-2">
                                    <div dangerouslySetInnerHTML={{ __html: previewBody }} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* ═══ Email Subject ═══ */}
            <section className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="px-5 py-4 border-b border-border-subtle bg-surface-elevated/50">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-warning/10 rounded-lg">
                            <Type size={16} className="text-warning" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-primary">Email Subject</h3>
                            <p className="text-xs text-muted mt-0.5">Format for the email subject line</p>
                        </div>
                    </div>
                </div>
                <div className="p-5 space-y-3">
                    <div className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/10 rounded-xl">
                        <Info size={14} className="text-warning mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-muted leading-relaxed">
                            Available placeholders: <code className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono text-primary">{'{courseName}'}</code> — course name,{' '}
                            <code className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono text-primary">{'{date}'}</code> — invite date
                        </p>
                    </div>
                    <input
                        type="text"
                        value={config.emailSubjectFormat}
                        onChange={e => setLocalConfig({ ...config, emailSubjectFormat: e.target.value })}
                        className="w-full px-4 py-2.5 bg-background border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all text-primary placeholder:text-muted/40"
                        placeholder="e.g. {courseName} — {date}"
                    />
                </div>
            </section>

            {/* ═══ Status Clarification Template ═══ */}
            <section className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="px-5 py-4 border-b border-border-subtle bg-surface-elevated/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-violet-500/10 rounded-lg">
                            <Briefcase size={16} className="text-violet-500" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-primary">Status Clarification Template</h3>
                            <p className="text-xs text-muted mt-0.5">Email sent to graduates to check employment status</p>
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
                        {/* Placeholder hints */}
                        <div className="flex items-start gap-2 p-3 bg-violet-500/5 border border-violet-500/10 rounded-xl">
                            <Info size={14} className="text-violet-500 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-muted leading-relaxed">
                                Available placeholders:{' '}
                                <code className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono text-primary">{'{statusLink}'}</code> — raw URL,{' '}
                                <code className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono text-primary">{'{statusButton}'}</code> — styled HTML button
                            </p>
                        </div>

                        <div className="w-full bg-background border border-border-strong rounded-xl text-sm focus-within:ring-2 focus-within:ring-violet-500/50 focus-within:border-violet-500 transition-all text-primary [&_.ql-toolbar]:bg-surface-elevated/50 [&_.ql-toolbar]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-border-subtle [&_.ql-toolbar]:rounded-t-xl [&_.ql-container]:border-none [&_.ql-container]:rounded-b-xl [&_.ql-editor]:min-h-[200px] [&_.ql-editor]:max-h-[400px] [&_.ql-editor]:overflow-y-auto [&_.ql-editor]:p-4 [&_.ql-stroke]:stroke-primary dark:[&_.ql-stroke]:stroke-white [&_.ql-fill]:fill-primary dark:[&_.ql-fill]:fill-white [&_.ql-picker]:text-primary dark:[&_.ql-picker]:text-white">
                            <ReactQuill
                                theme="snow"
                                value={config.statusEmailTemplate.replace(/\{origin\}/g, origin)}
                                onChange={(content) => {
                                    const cleanContent = content.replace(originRegex, '{origin}');
                                    if (cleanContent !== config.statusEmailTemplate) {
                                        setLocalConfig(prev => ({ ...prev, statusEmailTemplate: cleanContent }));
                                    }
                                }}
                                modules={quillModules}
                            />
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
                        <div className="space-y-3 animate-fadeIn h-full">
                            <div className="text-xs font-bold text-muted uppercase tracking-wider">Live Preview</div>
                            <div className="p-4 bg-background border border-border-subtle rounded-xl">
                                <div className="text-xs text-muted mb-2">
                                    <span className="font-semibold">Subject: </span>
                                    <span className="text-primary">{config.statusEmailSubjectFormat}</span>
                                </div>
                                <hr className="border-border-subtle mb-3" />
                                <div className="bg-white text-gray-900 rounded-lg overflow-hidden border border-border-subtle p-6 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-violet-500 [&_a]:underline [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_p]:mb-2">
                                    <div dangerouslySetInnerHTML={{ __html: statusPreviewBody }} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* ═══ Status Email Subject ═══ */}
            <section className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="px-5 py-4 border-b border-border-subtle bg-surface-elevated/50">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-violet-500/10 rounded-lg">
                            <Type size={16} className="text-violet-500" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-primary">Status Email Subject</h3>
                            <p className="text-xs text-muted mt-0.5">Subject line for status clarification emails</p>
                        </div>
                    </div>
                </div>
                <div className="p-5">
                    <input
                        type="text"
                        value={config.statusEmailSubjectFormat}
                        onChange={e => setLocalConfig({ ...config, statusEmailSubjectFormat: e.target.value })}
                        className="w-full px-4 py-2.5 bg-background border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all text-primary placeholder:text-muted/40"
                        placeholder="e.g. Quick Status Update"
                    />
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
                            <h3 className="text-sm font-bold text-primary">Display Preferences</h3>
                            <p className="text-xs text-muted mt-0.5">Customize how dates and data are displayed</p>
                        </div>
                    </div>
                </div>
                <div className="p-5">
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
            </section>

            {/* ═══ Info Footer ═══ */}
            <div className="flex items-center gap-2 text-xs text-muted px-1">
                <Info size={12} />
                <span>Settings are saved locally in your browser and will persist across sessions.</span>
            </div>
        </div>
    );
}
