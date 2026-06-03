
export enum DataType {
  ELECTRICITY = 'Electricity',
  FUEL_DIESEL = 'Fuel (Diesel)',
  FUEL_PETROL = 'Fuel (Petrol)',
  TRANSPORT = 'Transport'
}

export interface RequestMetadata {
  id: string;
  buyerCompanyName: string;
  dataType: DataType | 'ANY';
  reportingPeriod: string;
  createdAt: number;
}

export interface ExtractedItem {
  value: number;
  unit: string;
  dataType: DataType;
  confidence: number;
}

export interface ExtractionResult {
  items: ExtractedItem[];
  supplierName?: string;
  billingPeriod?: string;
  confidence: number;
  reasoning?: string;
  accountNumber?: string;
  invoiceNumber?: string;
  tariff?: string;
  amountPayable?: number;
  currentCharge?: number;
  billDate?: string;
  postalAddress?: string;
  icptCharge?: number;
  kwtbbCharge?: number;
  currentUsageChargeDetail?: number;
}

export interface SubmissionData {
  id: string;
  requestId: string;
  buyerName: string;
  activityValue: number;
  unit: string;
  dataType: DataType;
  emissionsKgCO2e: number;
  emissionFactor: number;
  notes?: string;
  timestamp: number;
  fileName?: string;
  accountNumber?: string;
  invoiceNumber?: string;
  tariff?: string;
  amountPayable?: number;
  currentCharge?: number;
  billingPeriod?: string;
  billDate?: string;
  postalAddress?: string;
  icptCharge?: number;
  kwtbbCharge?: number;
  currentUsageChargeDetail?: number;
}

export const EMISSION_FACTORS: Record<DataType, number> = {
  [DataType.ELECTRICITY]: 0.50,   // kgCO2e per kWh
  [DataType.FUEL_DIESEL]: 2.68,    // kgCO2e per liter
  [DataType.FUEL_PETROL]: 2.31,    // kgCO2e per liter
  [DataType.TRANSPORT]: 0.21,      // kgCO2e per km
};

export const DATA_UNITS: Record<DataType, string> = {
  [DataType.ELECTRICITY]: 'kWh',
  [DataType.FUEL_DIESEL]: 'liters',
  [DataType.FUEL_PETROL]: 'liters',
  [DataType.TRANSPORT]: 'km'
};
