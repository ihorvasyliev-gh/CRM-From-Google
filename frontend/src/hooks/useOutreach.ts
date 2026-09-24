import { supabase } from '../lib/supabase';

/** A named external list, e.g. "Action 11" (clients registered in IRIS). */
export interface OutreachList {
    id: string;
    name: string;
    created_at: string;
}

export interface OutreachContact {
    id: string;
    list_id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    external_ref: string | null;
    notes: string | null;
    status: 'not_contacted' | 'pending' | 'responded';
    is_working: boolean | null;
    started_month: string | null;
    field_of_work: string | null;
    employment_type: string | null;
    last_invited_at: string | null;
    last_responded_at: string | null;
    created_at: string;
    /** The same email also belongs to a CRM student */
    in_crm: boolean;
}

export async function fetchOutreachListsFn(): Promise<OutreachList[]> {
    const { data, error } = await supabase
        .from('outreach_lists')
        .select('id, name, created_at')
        .order('name');
    if (error) throw error;
    return data || [];
}

export async function fetchOutreachContactsFn(listId: string): Promise<OutreachContact[]> {
    let contacts: OutreachContact[] = [];
    let from = 0;
    const limit = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('outreach_contacts_view')
            .select('*')
            .eq('list_id', listId)
            .order('created_at', { ascending: false })
            .order('id')
            .range(from, from + limit - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        contacts = [...contacts, ...data];
        if (data.length < limit) break;
        from += limit;
    }
    return contacts;
}
