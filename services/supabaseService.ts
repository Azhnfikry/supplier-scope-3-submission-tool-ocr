import { createClient } from '@supabase/supabase-js';
import { SubmissionData } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const toRow = (sub: SubmissionData) => ({
  id: sub.id,
  request_id: sub.requestId,
  buyer_name: sub.buyerName,
  activity_value: sub.activityValue,
  unit: sub.unit,
  data_type: sub.dataType,
  emissions_kg_co2e: sub.emissionsKgCO2e,
  emission_factor: sub.emissionFactor,
  notes: sub.notes ?? null,
  timestamp: sub.timestamp,
  file_name: sub.fileName ?? null,
  account_number: sub.accountNumber ?? null,
  invoice_number: sub.invoiceNumber ?? null,
  tariff: sub.tariff ?? null,
  amount_payable: sub.amountPayable ?? null,
  current_charge: sub.currentCharge ?? null,
  billing_period: sub.billingPeriod ?? null,
  bill_date: sub.billDate ?? null,
  postal_address: sub.postalAddress ?? null,
  icpt_charge: sub.icptCharge ?? null,
  kwtbb_charge: sub.kwtbbCharge ?? null,
  current_usage_charge_detail: sub.currentUsageChargeDetail ?? null,
});

const fromRow = (row: any): SubmissionData => ({
  id: row.id,
  requestId: row.request_id,
  buyerName: row.buyer_name,
  activityValue: row.activity_value,
  unit: row.unit,
  dataType: row.data_type,
  emissionsKgCO2e: row.emissions_kg_co2e,
  emissionFactor: row.emission_factor,
  notes: row.notes,
  timestamp: row.timestamp,
  fileName: row.file_name,
  accountNumber: row.account_number,
  invoiceNumber: row.invoice_number,
  tariff: row.tariff,
  amountPayable: row.amount_payable,
  currentCharge: row.current_charge,
  billingPeriod: row.billing_period,
  billDate: row.bill_date,
  postalAddress: row.postal_address,
  icptCharge: row.icpt_charge,
  kwtbbCharge: row.kwtbb_charge,
  currentUsageChargeDetail: row.current_usage_charge_detail,
});

export const DB = {
  saveSubmission: async (sub: SubmissionData): Promise<void> => {
    const { error } = await supabase.from('scope3_submissions').insert(toRow(sub));
    if (error) throw new Error(error.message);
  },

  getSubmissions: async (): Promise<SubmissionData[]> => {
    const { data, error } = await supabase
      .from('scope3_submissions')
      .select('*')
      .order('timestamp', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
  },

  deleteSubmission: async (id: string): Promise<void> => {
    const { error } = await supabase.from('scope3_submissions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  clearAll: async (): Promise<void> => {
    const { error } = await supabase.from('scope3_submissions').delete().neq('id', '');
    if (error) throw new Error(error.message);
  },
};
