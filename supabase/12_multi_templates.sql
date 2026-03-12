-- Add is_active column to document_templates for multi-template support
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
