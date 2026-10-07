export interface PaystackConfig {
  publicKey: string;
  secretKey: string;
}

export interface ProposalFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  dataUrl?: string;
  uploadedAt: number | string;
  category?: 'pitch_deck' | 'proposal_doc' | 'contract' | 'brochure' | 'specs' | 'logo' | 'other' | string;
  description?: string;
}

export interface ProposalItem {
  id: string;
  schoolName: string;
  contactPerson: string;
  phone: string;
  email: string;
  location: string;
  studentsCount: number;
  tier: string;
  currency: string;
  selectedModules: string[];
  modulePrices?: Record<string, number>;
  addOns: string[];
  discountPercent: number;
  billingFrequency: 'term' | 'annual' | 'biennial';
  status: 'Draft' | 'Pitch Scheduled' | 'Presented' | 'Negotiation' | 'Deal Won';
  createdAt: string;
  updatedAt?: number | string;
  totalPerTerm: number;
  totalAnnual: number;
  notes: string;
  files?: ProposalFile[];
}

