import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VibeFilters {
  prospect_region_country_code?: string[];   // e.g. ["US-TX"]
  job_level?: string[];                       // e.g. ["c-suite","owner","director"]
  job_department?: string[];
  job_title?: string[];
  company_size?: string;                      // e.g. "1-50"
  company_revenue?: string;                   // e.g. "1M-5M"
  linkedin_category?: string[];
  has_email?: boolean;
  has_phone_number?: boolean;
  city_region?: string[];
  website_keywords?: string[];
}

export interface VibeProspect {
  prospect_id?: string;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  company_name?: string;
  company_domain?: string;
  linkedin_url?: string;
  city?: string;
  region?: string;
  country?: string;
  company_size?: string;
  company_revenue?: string;
  industry?: string;
  email?: string;
  phone?: string;
  [key: string]: unknown;
}

export interface ApolloFilters {
  person_locations?: string[];               // e.g. ["Houston, TX, United States"]
  person_seniorities?: string[];             // e.g. ["owner","c_suite","vp","director"]
  person_titles?: string[];
  organization_locations?: string[];
  organization_num_employees_ranges?: string[];
  q_keywords?: string;
  contact_email_status?: string[];
}

export interface ApolloPerson {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  organization_name: string | null;
  organization?: { website_url?: string; primary_domain?: string } | null;
  email: string | null;
  phone_numbers?: Array<{ sanitized_number: string }>;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedin_url: string | null;
  employment_history?: unknown[];
  [key: string]: unknown;
}

export interface ApolloSequence {
  id: string;
  name: string;
  active: boolean;
  creation_type?: string;
}

export interface ApolloEmailAccount {
  id: string;
  email: string;
  name?: string;
}

// ── Vibe Prospecting hook ─────────────────────────────────────────────────────

export function useVibeSearch() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<VibeProspect[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const search = async (filters: VibeFilters, size = 25) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("vibe-proxy", {
        body: { action: "search", entity_type: "prospects", filters, size },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      // Explorium returns { data: [...], total: N }
      setResults(data?.data ?? data?.prospects ?? []);
      setTotal(data?.total ?? data?.count ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setResults([]); setTotal(0); setError(null); };

  return { loading, results, total, error, search, reset };
}

// ── Apollo hooks ──────────────────────────────────────────────────────────────

export function useApolloSearch() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ApolloPerson[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const search = async (filters: ApolloFilters, page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("apollo-proxy", {
        body: { action: "people_search", params: { ...filters, page } },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setResults(data?.people ?? []);
      setTotal(data?.pagination?.total_entries ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setResults([]); setTotal(0); setError(null); };

  return { loading, results, total, error, search, reset };
}

export function useApolloSequences() {
  const [loading, setLoading] = useState(false);
  const [sequences, setSequences] = useState<ApolloSequence[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchSequences = async (query?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("apollo-proxy", {
        body: { action: "campaigns_search", params: query ? { q_name: query } : {} },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setSequences(data?.emailer_campaigns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return { loading, sequences, error, fetchSequences };
}

export function useApolloEmailAccounts() {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<ApolloEmailAccount[]>([]);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("apollo-proxy", {
        body: { action: "email_accounts" },
      });
      setAccounts(data?.email_accounts ?? []);
    } finally {
      setLoading(false);
    }
  };

  return { loading, accounts, fetchAccounts };
}

export async function pushContactToApollo(contact: {
  first_name?: string; last_name?: string; title?: string;
  email?: string; organization_name?: string; website_url?: string;
}): Promise<{ apollo_id: string }> {
  const { data, error } = await supabase.functions.invoke("apollo-proxy", {
    body: { action: "create_contact", params: contact },
  });
  if (error || data?.error) throw new Error(data?.error ?? String(error));
  return { apollo_id: data?.contact?.id };
}

export async function addContactToSequence(opts: {
  campaign_id: string;
  contact_ids: string[];
  email_account_id: string;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke("apollo-proxy", {
    body: { action: "add_to_campaign", ...opts },
  });
  if (error || data?.error) throw new Error(data?.error ?? String(error));
}
