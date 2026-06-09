import { GoogleGenAI, Type } from "@google/genai";
import { DataType, ExtractionResult } from "../types";

export const extractDataFromDocument = async (
  base64Data: string,
  mimeType: string = "image/jpeg"
): Promise<ExtractionResult> => {
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Analyze this document (utility bill, fuel receipt, or invoice PDF/image) and extract emissions-relevant data, billing metadata, and mailing details.
    
    GUIDELINES:

    1. TNB Bill (Electricity — Tenaga Nasional Berhad):
       - Find "Penggunaan (kWh)" or usage total in the tabular breakdown (e.g. 69 kWh).
       - Supplier: "Tenaga Nasional Berhad".
       - Extract "ALAMAT POS" (Postal Address). CRITICAL: It is a multi-line block (4–6 lines). Start with the recipient/company name and include ALL subsequent lines (street, PO Box, village/district, postcode, city, state). Join all lines cleanly with commas.
       - Extract "NO. AKAUN" (Account Number), e.g., '210013217210'.
       - Extract "NO. INVOIS" (Invoice Number), e.g., '000107767606'.
       - Extract "TARIF" (Tariff Code), e.g., 'B:Perdagangan'.
       - Extract "Jumlah Bil Anda (RM)" (Total Amount Payable), e.g., 197.35.
       - Extract "Caj Semasa (RM)" (Current Charge), e.g., 33.05.
       - Extract "TARIKH BIL" (Bill Date), e.g., '01.09.2024'.
       - Extract "TEMPOH BIL" (Billing Period), e.g., '02.08.2024 - 01.09.2024'.
       - Extract "ICPT" amount, e.g., 2.55.
       - Extract "Kumpulan Wang Tenaga Boleh Baharu (1.6%)" amount, e.g., 0.48.
       - Extract "Jumlah Penggunaan Anda" charge in RM (excluding ICPT and KWTBB), e.g., 30.02.

    2. Sarawak Energy / SESCO Bill (Electricity):
       - Issued by "SYARIKAT SESCO BERHAD" (a subsidiary of Sarawak Energy Berhad).
       - Supplier: "Sarawak Energy Berhad (SESCO)".
       - Extract electricity consumption in KWH from the meter reading table (Current Reading minus Previous Reading = Total Units KWH).
       - Extract "CONTRACT ACCOUNT NO." as the account number, e.g., '100003504330'.
       - Extract "Inv. No" as the invoice number, e.g., '620004401137'.
       - Extract tariff from the bill header line (e.g., 'Domestic Tariff D' or 'Commercial Tariff C').
       - Extract "TOTAL AMOUNT" or "PAY NOW" value as amountPayable, e.g., 110.40.
       - Extract "Total Current Charges" as currentCharge, e.g., 110.40.
       - Extract invoice date (e.g., '19/05/2026') as billDate.
       - Extract billing period from the "Billing Period (DD.MM.YYYY - DD.MM.YYYY)" line, e.g., '21.04.2026 - 19.05.2026'.
       - Extract the recipient's postal address block (name + full address lines, joined with commas).
       - Extract "Electricity Charges" (pre-discount base amount) as currentUsageChargeDetail, e.g., 147.21.
       - Extract "Discount Sarawak" amount (negative value) as discountSarawak if present, e.g., -36.80.
       - Note: SESCO bills do NOT have ICPT or KWTBB charges — leave those as null/omitted.

    3. Sarawak Water / Water Bill:
       - Issued by "SARAWAK WATER SDN. BHD." or similar water authority.
       - Supplier: "Sarawak Water Sdn. Bhd." (or the specific issuing authority name).
       - dataType: "Water" — extract water consumption in '000 Litres from the meter reading table (Current minus Previous reading). Convert to actual litres by multiplying by 1000 (e.g., 20 × 1000 = 20,000 litres).
       - unit: 'liters' (store as actual litres value).
       - Extract "Account No" as the account number, e.g., 'M20110232608'.
       - Extract "Invoice No." as the invoice number, e.g., 'M/26/00347766'.
       - Extract tariff code (e.g., 'W1').
       - Extract "CURRENT MONTH CHARGES (RM)" as currentCharge, e.g., 6.35.
       - Extract "Total Amount Due (RM)" as amountPayable (may be negative if in credit), e.g., -238.50.
       - Extract "Invoice Date" as billDate, e.g., '12/05/2026'.
       - Extract "Month Bill" and "Due Date" to form billingPeriod, e.g., '05/2026 (due 11/06/2026)'.
       - Extract recipient's full address block (name + all address lines joined with commas).
       - Extract "Water Charge" amount as currentUsageChargeDetail, e.g., 10.80.
       - Extract "Sarawak Government Subsidy" amount (as a positive number for reference), e.g., 5.00.
       - Extract "Meter Rent" amount, e.g., 0.55.
       - Note: Water bills do NOT have ICPT or KWTBB — leave those null/omitted.

    4. Petronas SmartPay / Fuel Bills:
       - Look for "KUANTITI BELIAN (LTR)" or volume for different fuel types.
       - A single document may contain BOTH "Fuel (Petrol)" (Primax 95/97) and "Fuel (Diesel)" (Dynamic Diesel). Extract ALL that apply.
       - Supplier: "Petronas" or the specific station name.
       - Extract full postal address, account number, invoice/ticket number, billing period, and amount payable.

    5. Other Bills:
       - Extract any relevant consumption data for Electricity, Diesel, Petrol, Transport, or Water.
       - Attempt to extract postal address, account/invoice number, tariff, billing dates, and cost totals.

    Format output as a JSON object with:
    - items (array): each has value (number), unit (string: 'kWh' or 'liters'), dataType (string: 'Electricity', 'Fuel (Diesel)', 'Fuel (Petrol)', 'Transport', or 'Water'), confidence (number 0–1).
    - supplierName (string)
    - confidence (number, overall)
    - reasoning (string, concise step-by-step logic)
    - accountNumber (string, optional)
    - invoiceNumber (string, optional)
    - tariff (string, optional)
    - amountPayable (number, optional): Total Amount Due / Jumlah Bil (may be negative for credits)
    - currentCharge (number, optional): Current month charge
    - billingPeriod (string, optional)
    - billDate (string, optional)
    - postalAddress (string, optional): Full recipient address block, ALL lines joined with commas
    - icptCharge (number, optional): TNB-specific only
    - kwtbbCharge (number, optional): TNB-specific only
    - currentUsageChargeDetail (number, optional): Base usage charge before discounts/subsidies (Electricity Charges for SESCO, Water Charge for water bills)
    - discountSarawak (number, optional): SESCO-specific Sarawak Government electricity discount (negative value)
    - governmentSubsidy (number, optional): Water bill Sarawak Government subsidy amount (positive value)
    - meterRent (number, optional): Water bill meter rent charge
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  value: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  dataType: {
                    type: Type.STRING,
                    enum: ["Electricity", "Fuel (Diesel)", "Fuel (Petrol)", "Transport", "Water"]
                  },
                  confidence: { type: Type.NUMBER }
                },
                required: ["value", "unit", "dataType", "confidence"]
              }
            },
            supplierName: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
            accountNumber: { type: Type.STRING },
            invoiceNumber: { type: Type.STRING },
            tariff: { type: Type.STRING },
            amountPayable: { type: Type.NUMBER },
            currentCharge: { type: Type.NUMBER },
            billingPeriod: { type: Type.STRING },
            billDate: { type: Type.STRING },
            postalAddress: {
              type: Type.STRING,
              description: "The complete, multi-line postal address block. Include recipient/company name AND all subsequent lines (street, postcode, town, state). Join all lines cleanly with commas. Never truncate."
            },
            icptCharge: { type: Type.NUMBER },
            kwtbbCharge: { type: Type.NUMBER },
            currentUsageChargeDetail: { type: Type.NUMBER },
            discountSarawak: { type: Type.NUMBER },
            governmentSubsidy: { type: Type.NUMBER },
            meterRent: { type: Type.NUMBER },
          },
          required: ["items", "confidence"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No text returned from Gemini.");
    }

    return JSON.parse(resultText) as ExtractionResult;
  } catch (e: any) {
    console.error("Gemini Extraction Error:", e);

    if (e.message?.includes("400") || e.message?.includes("INVALID_ARGUMENT")) {
      throw new Error("The AI was unable to process this file format or the file is too large. Please try a standard JPEG/PNG or a smaller PDF.");
    }

    throw new Error(e.message || "Failed to extract data from document.");
  }
};