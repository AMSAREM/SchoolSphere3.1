export interface SupportTicketMessage {
  id: string;
  senderName: string;
  senderRole: string;
  isCreator: boolean;
  text: string;
  createdAt: number;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  schoolId: string;
  schoolName: string;
  submittedById: string;
  submittedByName: string;
  submittedByRole: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved';
  description: string;
  reply?: string;
  messages: SupportTicketMessage[];
  createdAt: number;
  updatedAt: number;
}

function buildHeaders(schoolId?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const token = localStorage.getItem('esepa_auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (schoolId) {
      headers['x-school-id'] = String(schoolId);
    }
  }
  return headers;
}

export function broadcastSupportTicketsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('schoolsphere_support_tickets_updated'));
  }
}

export async function fetchSupportTickets(params?: {
  schoolId?: string | null;
  schoolName?: string | null;
  userId?: string | null;
  role?: string | null;
  scope?: 'own' | 'school' | 'creator';
}): Promise<SupportTicket[]> {
  try {
    const qs = new URLSearchParams();
    if (params?.schoolId) qs.set('schoolId', String(params.schoolId));
    if (params?.schoolName) qs.set('schoolName', String(params.schoolName));
    if (params?.userId) qs.set('userId', String(params.userId));
    if (params?.role) qs.set('role', String(params.role));
    if (params?.scope) qs.set('scope', params.scope);

    const queryString = qs.toString();
    const res = await fetch(`/api/support/tickets${queryString ? `?${queryString}` : ''}`, {
      headers: buildHeaders(params?.schoolId)
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.tickets)) {
        return data.tickets;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch support tickets:', err);
  }
  return [];
}

export async function createSupportTicket(payload: {
  schoolId?: string | null;
  schoolName: string;
  submittedById: string;
  submittedByName: string;
  submittedByRole: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
  try {
    const res = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: buildHeaders(payload.schoolId),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success && data?.ticket) {
      broadcastSupportTicketsChanged();
      return { success: true, ticket: data.ticket };
    }
    return {
      success: false,
      error: data?.error || 'Failed to submit support ticket.'
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error while submitting support ticket.'
    };
  }
}

export async function updateSupportTicket(
  id: string,
  payload: {
    status?: 'open' | 'in_progress' | 'resolved';
    priority?: 'low' | 'medium' | 'high' | 'critical';
    messageText?: string;
    senderName?: string;
    senderRole?: string;
    isCreator?: boolean;
    schoolId?: string | null;
  }
): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
  try {
    const res = await fetch(`/api/support/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: buildHeaders(payload.schoolId),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success && data?.ticket) {
      broadcastSupportTicketsChanged();
      return { success: true, ticket: data.ticket };
    }
    return {
      success: false,
      error: data?.error || 'Failed to update support ticket.'
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error while updating support ticket.'
    };
  }
}

export async function deleteSupportTicket(
  id: string,
  schoolId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/support/tickets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: buildHeaders(schoolId)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success) {
      broadcastSupportTicketsChanged();
      return { success: true };
    }
    return {
      success: false,
      error: data?.error || 'Failed to delete support ticket.'
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error while deleting support ticket.'
    };
  }
}
