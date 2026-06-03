
import { GoogleGenAI, Type } from "@google/genai";
import { DataType, ExtractionResult } from "../types";

export const extractDataFromDocument = async (
  base64Data: string,
  mimeType: string = "image/jpeg"
): Promise<ExtractionResult> => {
  // Clean base64 string
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

  // Initializing with the system provided API key
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Analyze this document (utility bill, fuel receipt, or invoice PDF/image) and extract Scope 3 emissions data, along with deep billing metadata and mailing details.
    
    GUIDELINES:
    1. TNB Bill (Electricity):
       - Find "Penggunaan (kWh)" or usage total in the tabular breakdown (e.g. 69 kWh).
       - Supplier: "Tenaga Nasional Berhad".
       - Extract "ALAMAT POS" (Postal Address / Alamat Pos). CRITICAL EXTREME WARNING: "ALAMAT POS" on TNB bills is a highly structured multi-line postal address block (usually 4 to 6 lines, printed in the upper left section). It starts with a company or recipient name (e.g., "PERTUBUHAN PELADANG KAW LINTANG") but you MUST extract the ENTIRE address block block including all subsequent lines of the street/PO Box, village/district, postcode, city, and state (e.g., "PERTUBUHAN PELADANG KAW LINTANG, L 8698, JLN FELDA, KG SUNGAI SEJUK, 31100 SUNGAI SIPUT (U), PERAK"). Never stop at the first line. Join all lines of this address block together cleanly with commas.
       - Extract "NO. AKAUN" (Account Number), e.g., '210013217210'.
       - Extract "NO. INVOIS" (Invoice Number), e.g., '000107767606'.
       - Extract "TARIF" (Tariff Code), e.g., 'B:Perdagangan'.
       - Extract "Jumlah Bil Anda (RM)" (Total Amount Payable / Total Bill), e.g., 197.35.
       - Extract "Caj Semasa (RM)" (Current Charge for this billing period), e.g., 33.05.
       - Extract "TARIKH BIL" (Bill Date), e.g., '01.09.2024'.
       - Extract "TEMPOH BIL" (Billing Period), e.g., '02.08.2024 - 01.09.2024'.
       
       - Detailed breakdown items below "Alamat Pos" or on Page 2:
         - Extract "ICPT" amount (under "Tanpa ST" / "Dengan ST" or "Jumlah"), e.g., 2.55.
         - Extract "Kumpulan Wang Tenaga Boleh Baharu (1.6%)" amount, e.g., 0.48.
         - Extract "Jumlah Penggunaan Anda" charge in RM (excluding ICPT and KWTBB), e.g., 30.02.
         
    2. Petronas SmartPay / Fuel Bills:
       - Look for "KUANTITI BELIAN (LTR)" or volume for different fuel types.
       - IMPORTANT: A single document may contain BOTH "Fuel (Petrol)" (often labeled as Primax 95/97) or "Fuel (Diesel)" (often labeled as Dynamic Diesel). Extract ALL that apply.
       - Supplier: "Petronas" or the specific station name.
       - Extract the full postal address if printed (look for multi-line recipient + street/district address block and join with commas, never just the first line), along with any account number, invoice/ticket number, billing period, and amount payable.
    
    3. Other Bills:
       - Extract any relevant consumption data for Electricity, Diesel, Petrol, or Transport.
       - Attempt to extract identifying metadata such as the complete multi-line postal address (alamat pos - capturing recipient name as well as street, town, postcode, and state joined with commas), account/invoice number, tariff, billing dates, ICPT charges, and cost totals.
 
    Format the output as a JSON object with:
    - items (array of objects):
        - value (number): the numeric quantity found.
        - unit (string): 'kWh' or 'liters'.
        - dataType (string): 'Electricity', 'Fuel (Diesel)', 'Fuel (Petrol)', or 'Transport'.
        - confidence (number): score between 0 and 1.
    - supplierName (string): name of the issuer contextually.
    - confidence (number): overall confidence score.
    - reasoning (string): concise step-by-step logic.
    - accountNumber (string, optional): Account number of the utility.
    - invoiceNumber (string, optional): Invoice or document number.
    - tariff (string, optional): Tariff code/rate identifier, e.g., 'B:Perdagangan'.
    - amountPayable (number, optional): Total amount payable of the bill (Jumlah Bil Anda / Total Bill).
    - currentCharge (number, optional): Current period charge (Caj Semasa).
    - billingPeriod (string, optional): Billing duration or statement period (Tempoh Bil).
    - billDate (string, optional): Main statement issue date (Tarikh Bil).
    - postalAddress (string, optional): Postal address of the receiver (Alamat Pos).
    - icptCharge (number, optional): ICPT charge amount in RM.
    - kwtbbCharge (number, optional): Kumpulan Wang Tenaga Boleh Baharu (1.6%) charge in RM.
    - currentUsageChargeDetail (number, optional): Bill value for base usage in RM (excluding ICPT / tax).
  `;
 
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
                    enum: ["Electricity", "Fuel (Diesel)", "Fuel (Petrol)", "Transport"]
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
              description: "The complete, multi-line postal address block found under or beside the 'ALAMAT POS' header. WARNING: You MUST include the recipient/company name and ALL subsequent lines (street name, postcode, town, and state). Do NOT truncate! Join all lines of this mailing block together cleanly with commas."
            },
            icptCharge: { type: Type.NUMBER },
            kwtbbCharge: { type: Type.NUMBER },
            currentUsageChargeDetail: { type: Type.NUMBER }
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
