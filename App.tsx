
import React, { useState, useEffect } from 'react';
import { DataType, SubmissionData, EMISSION_FACTORS, DATA_UNITS, ExtractedItem } from './types';
import { extractDataFromDocument } from './services/geminiService';
import { DB } from './services/supabaseService';

const Layout = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen flex flex-col bg-slate-50/50">
    <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => {
        window.location.hash = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}>
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
          <span className="text-white font-black text-lg">OCR</span>
        </div>
        <div>
          <span className="font-bold text-slate-900 block leading-tight">Scope 3 OCR</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Extraction & CSV Converter</span>
        </div>
      </div>
      <div className="flex gap-6 text-sm font-semibold text-slate-500">
        <button 
          onClick={() => document.getElementById('ocr-section')?.scrollIntoView({ behavior: 'smooth' })} 
          className="hover:text-indigo-600 transition-colors py-2 text-left"
        >
          OCR Extractor
        </button>
        <button 
          onClick={() => document.getElementById('history-section')?.scrollIntoView({ behavior: 'smooth' })} 
          className="hover:text-indigo-600 transition-colors py-2 text-left"
        >
          History & CSV Convert
        </button>
      </div>
    </nav>
    <main className="flex-1 pb-20">{children}</main>
  </div>
);


const SubmissionTool = ({ prefill, onSubmissionSaved }: { prefill?: { buyer?: string, type?: string, period?: string }, onSubmissionSaved?: () => void }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<{msg: string, type: 'info' | 'warn' | 'error'} | null>(null);

  // Additional billing metadata states
  const [accountNumber, setAccountNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [tariff, setTariff] = useState('');
  const [amountPayable, setAmountPayable] = useState<number | ''>('');
  const [currentCharge, setCurrentCharge] = useState<number | ''>('');
  const [billingPeriod, setBillingPeriod] = useState('');
  const [billDate, setBillDate] = useState('');
  const [postalAddress, setPostalAddress] = useState('');
  const [icptCharge, setIcptCharge] = useState<number | ''>('');
  const [kwtbbCharge, setKwtbbCharge] = useState<number | ''>('');
  const [currentUsageChargeDetail, setCurrentUsageChargeDetail] = useState<number | ''>('');

  // Batch queuing & automatic processing states
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [hasCompletedBatch, setHasCompletedBatch] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchProgressIndex, setBatchProgressIndex] = useState(0);
  const [batchLogs, setBatchLogs] = useState<{
    name: string;
    status: 'pending' | 'processing' | 'success' | 'error';
    errorMsg?: string;
    itemsExtracted?: number;
  }[]>([]);

  // Drag and drop Visual State
  const [isDragging, setIsDragging] = useState(false);

  const startBatchProcessing = async (files: File[]) => {
    if (files.length === 0) return;
    setIsBatchProcessing(true);
    setHasCompletedBatch(false);
    setBatchFiles(files);
    setBatchProgressIndex(0);
    
    // Initialize logs
    const initialLogs = files.map(f => ({
      name: f.name,
      status: 'pending' as const
    }));
    setBatchLogs(initialLogs);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setBatchProgressIndex(i);
      
      // Update status to processing
      setBatchLogs(prev => prev.map((log, idx) => idx === i ? { ...log, status: 'processing' } : log));

      try {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(file);
        });

        const result = await extractDataFromDocument(base64Data, file.type || "application/pdf");
        
        if (result && result.items && result.items.length > 0) {
          // Immediately save submissions into DB in real-time
          for (const item of result.items) {
            const factor = EMISSION_FACTORS[item.dataType];
            const submission: SubmissionData = {
              id: Math.random().toString(36).substring(2, 9),
              requestId: prefill?.buyer || 'INTERNAL',
              buyerName: prefill?.buyer || 'Direct Submission',
              activityValue: Number(item.value),
              unit: DATA_UNITS[item.dataType],
              dataType: item.dataType,
              emissionsKgCO2e: Number(item.value) * factor,
              emissionFactor: factor,
              notes: `Automated OCR from file: ${file.name}${prefill?.period ? ` [Period: ${prefill.period}]` : ''}`,
              timestamp: Date.now(),
              fileName: result.supplierName || file.name,
              accountNumber: result.accountNumber || undefined,
              invoiceNumber: result.invoiceNumber || undefined,
              tariff: result.tariff || undefined,
              amountPayable: result.amountPayable !== undefined && result.amountPayable !== null ? Number(result.amountPayable) : undefined,
              currentCharge: result.currentCharge !== undefined && result.currentCharge !== null ? Number(result.currentCharge) : undefined,
              billingPeriod: result.billingPeriod || undefined,
              billDate: result.billDate || undefined,
              postalAddress: result.postalAddress || undefined,
              icptCharge: result.icptCharge !== undefined && result.icptCharge !== null ? Number(result.icptCharge) : undefined,
              kwtbbCharge: result.kwtbbCharge !== undefined && result.kwtbbCharge !== null ? Number(result.kwtbbCharge) : undefined,
              currentUsageChargeDetail: result.currentUsageChargeDetail !== undefined && result.currentUsageChargeDetail !== null ? Number(result.currentUsageChargeDetail) : undefined
            };
            await DB.saveSubmission(submission);
          }

          // Trigger refresh of the parent list so they show up *instantly* in the history table!
          if (onSubmissionSaved) {
            onSubmissionSaved();
          }

          successCount++;
          setBatchLogs(prev => prev.map((log, idx) => idx === i ? { 
            ...log, 
            status: 'success', 
            itemsExtracted: result.items.length 
          } : log));
        } else {
          throw new Error("No data items detected.");
        }
      } catch (err: any) {
        errorCount++;
        setBatchLogs(prev => prev.map((log, idx) => idx === i ? { 
          ...log, 
          status: 'error', 
          errorMsg: err.message || "Failed to extract values." 
        } : log));
      }
    }

    setIsBatchProcessing(false);
    setHasCompletedBatch(true);
    
    setSuccessToast(`Folder/Batch Complete! Successfully extracted ${successCount} document(s). ${errorCount > 0 ? `Failed ${errorCount} document(s).` : ''}`);
    setTimeout(() => {
      setSuccessToast(null);
    }, 6000);

    // Scroll slightly down to focus on submission history
    setTimeout(() => {
      document.getElementById('history-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 200);
  };

  const processSingleFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setFeedback({ msg: "File too large (>10MB).", type: 'error' });
      return;
    }

    setIsProcessing(true);
    setFeedback({ msg: "AI is processing your file...", type: 'info' });
    
    // Reset former states
    setAccountNumber('');
    setInvoiceNumber('');
    setTariff('');
    setAmountPayable('');
    setCurrentCharge('');
    setBillingPeriod('');
    setBillDate('');
    setPostalAddress('');
    setIcptCharge('');
    setKwtbbCharge('');
    setCurrentUsageChargeDetail('');
    
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const result = await extractDataFromDocument(base64Data, file.type || "image/jpeg");
        
        if (result && result.items && result.items.length > 0) {
          setExtractedItems(result.items);
          setSupplierName(result.supplierName || file.name);
          if (result.accountNumber) setAccountNumber(result.accountNumber);
          if (result.invoiceNumber) setInvoiceNumber(result.invoiceNumber);
          if (result.tariff) setTariff(result.tariff);
          if (result.amountPayable !== undefined && result.amountPayable !== null) setAmountPayable(result.amountPayable);
          if (result.currentCharge !== undefined && result.currentCharge !== null) setCurrentCharge(result.currentCharge);
          if (result.billingPeriod) setBillingPeriod(result.billingPeriod);
          if (result.billDate) setBillDate(result.billDate);
          if (result.postalAddress) setPostalAddress(result.postalAddress);
          if (result.icptCharge !== undefined && result.icptCharge !== null) setIcptCharge(result.icptCharge);
          if (result.kwtbbCharge !== undefined && result.kwtbbCharge !== null) setKwtbbCharge(result.kwtbbCharge);
          if (result.currentUsageChargeDetail !== undefined && result.currentUsageChargeDetail !== null) setCurrentUsageChargeDetail(result.currentUsageChargeDetail);
          
          setFeedback({ 
            msg: `Extracted ${result.items.length} items from ${result.supplierName || 'document'}.`, 
            type: result.confidence < 0.8 ? 'warn' : 'info' 
          });
        } else {
          throw new Error("AI could not detect usage values.");
        }
      } catch (err: any) {
        setFeedback({ msg: err.message || "Extraction failed.", type: 'error' });
        setManualMode(true);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files) as File[];
    if (filesArray.length > 1) {
      startBatchProcessing(filesArray);
    } else {
      processSingleFile(filesArray[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const filesArray = Array.from(files) as File[];
      if (filesArray.length > 1) {
        startBatchProcessing(filesArray);
      } else {
        processSingleFile(filesArray[0]);
      }
    }
  };

  const updateItem = (index: number, updates: Partial<ExtractedItem>) => {
    const newItems = [...extractedItems];
    newItems[index] = { ...newItems[index], ...updates };
    setExtractedItems(newItems);
  };

  const handleSave = async () => {
    if (!supplierName) {
      setFeedback({ msg: "Supplier name is required before submitting.", type: 'error' });
      return;
    }
    if (extractedItems.length === 0) {
      setFeedback({ msg: "At least one item must be extracted or added before submitting.", type: 'error' });
      return;
    }

    const activeSupplierName = supplierName;

    for (const item of extractedItems) {
      const factor = EMISSION_FACTORS[item.dataType];
      const submission: SubmissionData = {
        id: Math.random().toString(36).substring(2, 9),
        requestId: prefill?.buyer || 'INTERNAL',
        buyerName: prefill?.buyer || 'Direct Submission',
        activityValue: Number(item.value),
        unit: DATA_UNITS[item.dataType],
        dataType: item.dataType,
        emissionsKgCO2e: Number(item.value) * factor,
        emissionFactor: factor,
        notes: `${notes}${prefill?.period ? ` [Period: ${prefill.period}]` : ''}`,
        timestamp: Date.now(),
        fileName: activeSupplierName,
        accountNumber: accountNumber || undefined,
        invoiceNumber: invoiceNumber || undefined,
        tariff: tariff || undefined,
        amountPayable: amountPayable !== '' ? Number(amountPayable) : undefined,
        currentCharge: currentCharge !== '' ? Number(currentCharge) : undefined,
        billingPeriod: billingPeriod || undefined,
        billDate: billDate || undefined,
        postalAddress: postalAddress || undefined,
        icptCharge: icptCharge !== '' ? Number(icptCharge) : undefined,
        kwtbbCharge: kwtbbCharge !== '' ? Number(kwtbbCharge) : undefined,
        currentUsageChargeDetail: currentUsageChargeDetail !== '' ? Number(currentUsageChargeDetail) : undefined
      };
      await DB.saveSubmission(submission);
    }
    
    if (onSubmissionSaved) {
      onSubmissionSaved();
    }
    
    if (prefill?.buyer) {
      setSubmitted(true);
    } else {
      // Clear form for rapid successive entry
      setExtractedItems([]);
      setSupplierName('');
      setNotes('');
      setFeedback(null);
      setAccountNumber('');
      setInvoiceNumber('');
      setTariff('');
      setAmountPayable('');
      setCurrentCharge('');
      setBillingPeriod('');
      setBillDate('');
      setPostalAddress('');
      setIcptCharge('');
      setKwtbbCharge('');
      setCurrentUsageChargeDetail('');
      setManualMode(false);
      
      setSuccessToast(`Successfully processed and saved Scope 3 entry for "${activeSupplierName}"!`);
      setTimeout(() => {
        setSuccessToast(null);
      }, 5000);
      
      // Scroll slightly down to focus on submission history
      setTimeout(() => {
        document.getElementById('history-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  if (submitted) return (
    <div className="max-w-md mx-auto py-24 px-4 text-center animate-in fade-in duration-500">
      <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-100">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
      </div>
      <h2 className="text-3xl font-black text-slate-900 tracking-tight">Data Submitted</h2>
      <p className="text-slate-500 mt-4 text-lg">Thank you. Your emissions data has been sent to {prefill?.buyer || 'the buyer'}.</p>
      <button onClick={() => window.location.hash = ''} className="mt-10 bg-indigo-600 text-white font-bold py-3 px-8 rounded-xl shadow-lg">Done</button>
    </div>
  );

  const totalEmissions = extractedItems.reduce((acc, item) => {
    const factor = EMISSION_FACTORS[item.dataType];
    return acc + (Number(item.value) * factor);
  }, 0).toFixed(2);

  return (
    <div className="max-w-3xl mx-auto py-12 px-4" id="ocr-section">
      <div className="mb-10 text-center">
        {prefill?.buyer ? (
          <>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Request from {prefill.buyer}</h1>
            <p className="text-slate-500 mt-2 text-lg font-medium">Reporting Period: <span className="text-indigo-600">{prefill.period || 'Not Specified'}</span></p>
          </>
        ) : (
          <>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Scope 3 OCR Extractor</h1>
            <p className="text-slate-500 mt-2 text-lg font-medium">Upload Tenaga Nasional Berhad (TNB) utility bills to instantly extract consumption, cost, and postal addresses.</p>
          </>
        )}
      </div>

      {successToast && (
        <div className="mb-8 p-5 bg-emerald-50 border-2 border-emerald-100 text-emerald-800 rounded-[1.5rem] flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-300 shadow-sm shadow-emerald-50">
          <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shrink-0 shadow-md">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black tracking-widest uppercase text-emerald-600 leading-none">Saved Successfully</div>
            <div className="text-xs font-bold text-emerald-900 leading-tight mt-1 truncate">{successToast}</div>
          </div>
          <button 
            className="shrink-0 text-emerald-400 hover:text-emerald-600 font-black text-lg p-1.5 hover:bg-emerald-100/50 rounded-lg transition-colors leading-none" 
            onClick={() => setSuccessToast(null)}
          >
            ×
          </button>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden">
        <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <svg className="w-6 h-6 text-indigo-400" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path></svg>
            Extraction Engine
          </h2>
          {(extractedItems.length > 0 || manualMode) && (
            <button onClick={() => { setExtractedItems([]); setManualMode(false); setFeedback(null); }} className="text-xs font-bold text-indigo-400">Reset</button>
          )}
        </div>

        <div className="p-8 space-y-8">
          {/* Batch Processing Panel */}
          {(isBatchProcessing || hasCompletedBatch) ? (
            <div className="space-y-6 p-6 bg-slate-50 border border-slate-200 rounded-[2rem] text-slate-800 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/60 pb-5">
                <div>
                  <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    {isBatchProcessing && (
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
                      </span>
                    )}
                    {isBatchProcessing ? "Batch Document Processing..." : "Batch Processing Complete!"}
                  </h3>
                  <p className="text-slate-500 font-medium text-xs mt-1">
                    {isBatchProcessing 
                      ? `Processing of ${batchFiles.length} file(s) sequentially. Real-time entries appear below.` 
                      : `Successfully processed ${batchLogs.filter(l => l.status === 'success').length} of ${batchFiles.length} file(s).`
                    }
                  </p>
                </div>
                {hasCompletedBatch && (
                  <button 
                    onClick={() => {
                      setHasCompletedBatch(false);
                      setBatchFiles([]);
                      setBatchLogs([]);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md transition-all shrink-0"
                  >
                    Clear & Upload More
                  </button>
                )}
              </div>

              {/* Progress Indicator */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500 font-bold">
                  <span>Queue Progress</span>
                  <span>{
                    isBatchProcessing 
                      ? `${Math.round((batchProgressIndex / batchFiles.length) * 100)}%` 
                      : "100%"
                  } ({isBatchProcessing ? batchProgressIndex : batchFiles.length}/{batchFiles.length} files)</span>
                </div>
                <div className="w-full bg-slate-250 h-3.5 rounded-full overflow-hidden relative shadow-inner border border-slate-350/10">
                  <div 
                    className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                    style={{ 
                      width: `${isBatchProcessing 
                        ? Math.max(8, Math.round((batchProgressIndex / batchFiles.length) * 100)) 
                        : 100}%` 
                    }}
                  />
                </div>
              </div>

              {/* Status Log list */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">File Processing Log</h4>
                <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-2xl bg-white p-4 divide-y divide-slate-100/80 custom-scrollbar shadow-sm">
                  {batchLogs.map((log, index) => {
                    const isActive = isBatchProcessing && batchProgressIndex === index;
                    return (
                      <div key={index} className={`py-3 flex items-center justify-between gap-4 text-xs transition-colors ${isActive ? 'bg-indigo-50/40 -mx-4 px-4' : ''}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Log Icon based on status */}
                          {log.status === 'pending' && (
                            <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-[10px] shrink-0 border border-slate-200">
                              -
                            </div>
                          )}
                          {log.status === 'processing' && (
                            <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-200">
                              <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            </div>
                          )}
                          {log.status === 'success' && (
                            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200 leading-none">
                              ✓
                            </div>
                          )}
                          {log.status === 'error' && (
                            <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200 font-extrabold text-[11px] leading-none">
                              !
                            </div>
                          )}
                          <span className={`font-mono truncate font-bold text-slate-700 ${isActive ? 'text-indigo-900 font-extrabold' : ''}`}>
                            {log.name}
                          </span>
                        </div>

                        <div>
                          {log.status === 'pending' && <span className="text-slate-400 font-medium font-mono text-[10px]">Pending</span>}
                          {log.status === 'processing' && <span className="text-indigo-600 font-bold font-mono text-[10px] animate-pulse">Running OCR...</span>}
                          {log.status === 'success' && (
                            <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 font-bold px-2.5 py-0.5 rounded text-[10px] whitespace-nowrap">
                              Compiled: {log.itemsExtracted || 1} item(s)
                            </span>
                          )}
                          {log.status === 'error' && (
                            <span className="text-rose-600 bg-rose-50 border border-rose-100 font-bold px-2 py-0.5 rounded text-[9px] max-w-[200px] truncate block" title={log.errorMsg}>
                              {log.errorMsg || 'Failed'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="text-center pt-2">
                <button 
                  onClick={() => {
                    document.getElementById('history-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline transition-all flex items-center justify-center gap-2 mx-auto"
                >
                  <svg className="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 13l-7 7-7-7m14-6l-7 7-7-7" />
                  </svg>
                  View Compiled Table Directly Below
                </button>
              </div>
            </div>
          ) : (
            // Regular Single/Multi/Folder File Selector Dropzone
            !manualMode && extractedItems.length === 0 && (
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-3 border-dashed rounded-3xl p-16 text-center transition-all min-h-[300px] flex flex-col justify-center items-center ${
                  isDragging 
                    ? 'border-indigo-500 bg-indigo-50/70 scale-[0.99] shadow-inner' 
                    : isProcessing 
                      ? 'border-indigo-400 bg-indigo-50/50' 
                      : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'
                }`}
              >
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-6 py-8">
                    <div className="animate-spin rounded-full h-14 w-14 border-t-4 border-indigo-600 border-r-4 border-r-transparent"></div>
                    <p className="text-indigo-600 font-black text-lg animate-pulse">Reading Document...</p>
                  </div>
                ) : (
                  <div className="w-full">
                    <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-md shadow-indigo-100 transition-transform hover:scale-105">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                      </svg>
                    </div>

                    <p className="text-2xl font-black text-slate-800">Upload Data Sources</p>
                    <p className="text-slate-500 mt-2 font-medium max-w-md mx-auto text-sm">
                      Drag & drop a folder, multiple PDF invoices, or utility bill images to compile them instantly in a looping series.
                    </p>

                    <div className="mt-8 flex flex-wrap gap-4 justify-center items-center">
                      <label className="relative bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3.5 rounded-2xl font-black cursor-pointer text-xs shadow-lg hover:shadow-indigo-200 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2">
                        <span>📂 Select Folder</span>
                        <input 
                          type="file" 
                          className="hidden" 
                          onChange={handleFileUpload} 
                          accept="image/*,application/pdf"
                          {...({
                            webkitdirectory: "",
                            directory: "",
                            multiple: true
                          } as any)}
                        />
                      </label>

                      <label className="relative bg-slate-900 hover:bg-slate-950 text-white px-6 py-3.5 rounded-2xl font-black cursor-pointer text-xs shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2">
                        <span>📄 Select Multiple Files</span>
                        <input 
                          type="file" 
                          className="hidden" 
                          multiple 
                          onChange={handleFileUpload} 
                          accept="image/*,application/pdf" 
                        />
                      </label>
                    </div>

                    <button 
                      onClick={() => {
                        setManualMode(true);
                        setExtractedItems([{ value: 0, unit: 'kWh', dataType: DataType.ELECTRICITY, confidence: 1 }]);
                      }} 
                      className="block w-fit mx-auto mt-8 text-indigo-500 hover:text-indigo-700 text-[10px] font-black uppercase tracking-widest transition-colors hover:underline"
                    >
                      Skip to Manual Form Entry
                    </button>
                  </div>
                )}
              </div>
            )
          )}

          {(extractedItems.length > 0 || manualMode) && (
            <div className="space-y-6 animate-in fade-in duration-500">
              {feedback && (
                <div className={`p-4 rounded-xl text-sm font-bold border-2 ${feedback.type === 'error' ? 'bg-red-50 text-red-900 border-red-100' : 'bg-emerald-50 text-emerald-900 border-emerald-100'}`}>
                  {feedback.msg}
                </div>
              )}
              
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Supplier Name</label>
                  <input className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-5 py-4 font-bold" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
                </div>

                {/* Extracted Billing & Invoice Details Grid */}
                <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100/80 space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Extracted Billing Details
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 text-indigo-500">Postal Address (Alamat Pos)</label>
                      <textarea 
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold focus:ring-1 focus:ring-indigo-500" 
                        rows={2}
                        placeholder="Mailing address printed on top-left of Page 1"
                        value={postalAddress} 
                        onChange={(e) => setPostalAddress(e.target.value)} 
                      />
                    </div>

                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Account Number (No. Akaun)</label>
                      <input 
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold" 
                        placeholder="e.g. 210013217210"
                        value={accountNumber} 
                        onChange={(e) => setAccountNumber(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Invoice Number (No. Invois)</label>
                      <input 
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold" 
                        placeholder="e.g. 000107767606"
                        value={invoiceNumber} 
                        onChange={(e) => setInvoiceNumber(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Tariff Code (Tarif)</label>
                      <input 
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold" 
                        placeholder="e.g. B:Perdagangan"
                        value={tariff} 
                        onChange={(e) => setTariff(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Statement Date (Tarikh Bil)</label>
                      <input 
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold" 
                        placeholder="e.g. 01.09.2024"
                        value={billDate} 
                        onChange={(e) => setBillDate(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Billing Period (Tempoh Bil)</label>
                      <input 
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold" 
                        placeholder="e.g. 02.08.2024 - 01.09.2024"
                        value={billingPeriod} 
                        onChange={(e) => setBillingPeriod(e.target.value)} 
                      />
                    </div>

                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 text-slate-500">Base Usage Charge (Jumlah Penggunaan, RM)</label>
                      <input 
                        type="number"
                        step="0.01"
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold" 
                        placeholder="e.g. 30.02"
                        value={currentUsageChargeDetail} 
                        onChange={(e) => setCurrentUsageChargeDetail(e.target.value === '' ? '' : parseFloat(e.target.value))} 
                      />
                    </div>

                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 text-slate-500">ICPT Rebate/Surcharge (RM)</label>
                      <input 
                        type="number"
                        step="0.01"
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold" 
                        placeholder="e.g. 2.55"
                        value={icptCharge} 
                        onChange={(e) => setIcptCharge(e.target.value === '' ? '' : parseFloat(e.target.value))} 
                      />
                    </div>

                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 text-slate-500">KWTBB amount (1.6%, RM)</label>
                      <input 
                        type="number"
                        step="0.01"
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold" 
                        placeholder="e.g. 0.48"
                        value={kwtbbCharge} 
                        onChange={(e) => setKwtbbCharge(e.target.value === '' ? '' : parseFloat(e.target.value))} 
                      />
                    </div>

                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 text-indigo-600">Current Charge (Caj Semasa, RM)</label>
                      <input 
                        type="number"
                        step="0.01"
                        className="w-full rounded-xl border-2 border-indigo-100 bg-indigo-50/10 px-4 py-2.5 text-xs font-extrabold focus:outline-none focus:border-indigo-500" 
                        placeholder="e.g. 33.05"
                        value={amountPayable}
                        onChange={(e) => setAmountPayable(e.target.value === '' ? '' : parseFloat(e.target.value))} 
                      />
                    </div>

                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 text-indigo-600">Total Bill (Jumlah Bil, RM)</label>
                      <input 
                        type="number"
                        step="0.01"
                        className="w-full rounded-xl border border-indigo-200 bg-indigo-50/20 px-4 py-2.5 text-xs font-black focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                        placeholder="e.g. 197.35"
                        value={currentCharge}
                        onChange={(e) => setCurrentCharge(e.target.value === '' ? '' : parseFloat(e.target.value))} 
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Extracted Items</label>
                  {extractedItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-slate-50 rounded-2xl border border-slate-100 relative group">
                      <div>
                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Category</label>
                        <select 
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold"
                          value={item.dataType}
                          onChange={(e) => updateItem(idx, { dataType: e.target.value as DataType })}
                        >
                          {Object.values(DataType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantity ({DATA_UNITS[item.dataType]})</label>
                        <input 
                          type="number" 
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black" 
                          value={item.value} 
                          onChange={(e) => updateItem(idx, { value: e.target.value === '' ? 0 : parseFloat(e.target.value) })} 
                        />
                      </div>
                      <button 
                        onClick={() => setExtractedItems(extractedItems.filter((_, i) => i !== idx))}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <span className="text-xs">×</span>
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={() => setExtractedItems([...extractedItems, { value: 0, unit: 'kWh', dataType: DataType.ELECTRICITY, confidence: 1 }])}
                    className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-bold hover:border-indigo-400 hover:text-indigo-600 transition-all"
                  >
                    + Add Another Item
                  </button>
                </div>
              </div>

              <div className="bg-indigo-600 p-8 rounded-[2rem] text-white flex justify-between items-center">
                <div>
                  <p className="text-indigo-200 text-[10px] font-black uppercase mb-2">Total Calculated Emissions</p>
                  <p className="text-5xl font-black">{totalEmissions} <span className="text-lg opacity-60">kgCO₂e</span></p>
                </div>
              </div>
              <button onClick={handleSave} className="w-full bg-slate-900 text-white font-black py-5 rounded-[1.5rem] shadow-xl hover:scale-[1.02] transition-all">Submit {extractedItems.length} Items to {prefill?.buyer || 'Buyer'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const HistoryPage = ({ submissions, onRefresh }: { submissions: SubmissionData[], onRefresh: () => void }) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const exportToCSV = () => {
    if (submissions.length === 0) return;
    
    const headers = [
      "ID",
      "Timestamp",
      "Date",
      "Buyer Name",
      "DataType",
      "Activity Value",
      "Unit",
      "Emissions (kgCO2e)",
      "Supplier Module (FileName)",
      "Alamat Pos (Postal Address)",
      "No. Akaun (Account Number)",
      "No. Invois (Invoice Number)",
      "Tarif (Tariff Code)",
      "Tarikh Bil (Statement Date)",
      "Tempoh Bil (Billing Period)",
      "Base Usage Charge (RM)",
      "ICPT Charge (RM)",
      "KWTBB Charge (RM)",
      "Caj Semasa (RM)",
      "Jumlah Bil (RM)",
      "Notes"
    ];

    const escapeCSV = (val: any) => {
      if (val === undefined || val === null) return "";
      let str = String(val);
      // Escape inner quotes
      str = str.replace(/"/g, '""');
      // Wrap in double quotes if there are commas, double quotes or newlines
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str}"`;
      }
      return str;
    };

    const rows = submissions.map(sub => [
      sub.id,
      sub.timestamp,
      new Date(sub.timestamp).toISOString(),
      sub.buyerName,
      sub.dataType,
      sub.activityValue,
      sub.unit,
      sub.emissionsKgCO2e,
      sub.fileName || "Manual Entry",
      sub.postalAddress || "",
      sub.accountNumber || "",
      sub.invoiceNumber || "",
      sub.tariff || "",
      sub.billDate || "",
      sub.billingPeriod || "",
      sub.currentUsageChargeDetail !== undefined ? sub.currentUsageChargeDetail : "",
      sub.icptCharge !== undefined ? sub.icptCharge : "",
      sub.kwtbbCharge !== undefined ? sub.kwtbbCharge : "",
      sub.amountPayable !== undefined ? sub.amountPayable : "",
      sub.currentCharge !== undefined ? sub.currentCharge : "",
      sub.notes || ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(escapeCSV).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `scope3_submissions_export_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-6xl mx-auto py-12 px-6 border-t border-slate-200/65 mt-16" id="history-section">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-12">
        <div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tight">Submission History</h1>
          <p className="text-slate-500 mt-2 font-medium text-sm">Review extracted invoices and download compiled CSV sheets in one click.</p>
        </div>
        {submissions.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 px-5 py-3 rounded-xl font-bold border border-rose-100 transition-all text-sm w-fit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear All Real Data
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold shadow-md hover:shadow-lg hover:scale-[1.01] transition-all text-sm w-fit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export to CSV
            </button>
          </div>
        )}
      </div>
      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
        {submissions.length === 0 ? (
          <div className="p-32 text-center text-slate-400 font-bold">No history available. Upload utility bills above to start compiling your data.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="px-8 py-6">Buyer / Request</th>
                  <th className="px-8 py-6">Supplier & Billing Metadata</th>
                  <th className="px-8 py-6">Emissions / Usage</th>
                  <th className="px-8 py-6">Date</th>
                  <th className="px-8 py-6 text-center w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/55 transition-colors align-top">
                    <td className="px-8 py-8 font-bold text-slate-800 text-sm">
                      <div className="space-y-1">
                        <div>{sub.buyerName}</div>
                        <div className="text-[10px] font-semibold text-slate-400 font-mono tracking-tight bg-slate-100/60 w-fit px-2 py-0.5 rounded-md">ID: {sub.id}</div>
                      </div>
                    </td>
                    <td className="px-8 py-8 font-medium text-slate-500">
                      <div>
                        <div className="font-extrabold text-slate-800 text-base">{sub.fileName || 'Manual Entry'}</div>
                        {(sub.accountNumber || sub.invoiceNumber || sub.tariff || sub.billingPeriod || sub.billDate || sub.amountPayable || sub.currentCharge || sub.postalAddress || sub.icptCharge || sub.kwtbbCharge || sub.currentUsageChargeDetail) && (
                          <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[11px] bg-slate-50 border border-slate-100/85 p-4 rounded-xl max-w-lg shadow-sm">
                            {sub.postalAddress && (
                              <div className="col-span-1 border-b border-slate-200/50 pb-1.55">
                                <span className="font-bold text-slate-400 block mb-0.5 text-[9px] uppercase tracking-wider">Alamat Pos (Postal Address):</span>
                                <span className="text-slate-700 italic font-semibold block whitespace-pre-wrap leading-tight">{sub.postalAddress}</span>
                              </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                              {sub.accountNumber && (
                                <div>
                                  <span className="font-semibold text-slate-400 font-mono text-[10px]">No. Akaun:</span> <span className="text-slate-800 font-bold">{sub.accountNumber}</span>
                                </div>
                              )}
                              {sub.invoiceNumber && (
                                <div>
                                  <span className="font-semibold text-slate-400 font-mono text-[10px]">No. Invois:</span> <span className="text-slate-700 font-mono font-bold">{sub.invoiceNumber}</span>
                                </div>
                              )}
                              {sub.tariff && (
                                <div>
                                  <span className="font-semibold text-slate-400 text-[10px]">Tarif:</span> <span className="text-slate-700 font-semibold">{sub.tariff}</span>
                                </div>
                              )}
                              {sub.billDate && (
                                <div>
                                  <span className="font-semibold text-slate-400 text-[10px]">Tarikh Bil:</span> <span className="text-slate-700">{sub.billDate}</span>
                                </div>
                              )}
                              {sub.billingPeriod && (
                                <div className="sm:col-span-2">
                                  <span className="font-semibold text-slate-400 text-[10px]">Tempoh Bil:</span> <span className="text-slate-700">{sub.billingPeriod}</span>
                                </div>
                              )}
                            </div>
                            
                            {(sub.currentUsageChargeDetail !== undefined || sub.icptCharge !== undefined || sub.kwtbbCharge !== undefined || sub.amountPayable !== undefined || sub.currentCharge !== undefined) && (
                              <div className="border-t border-slate-200/60 pt-1.5 mt-1 space-y-1">
                                <span className="font-bold text-slate-400 block text-[9px] uppercase tracking-wider">Billing Breakdown:</span>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] text-slate-600 bg-white/60 p-2 rounded-lg border border-slate-100">
                                  {sub.currentUsageChargeDetail !== undefined && (
                                    <div>
                                      <span className="text-slate-400 block">Base Usage:</span> <span className="font-bold text-slate-700">RM{sub.currentUsageChargeDetail.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {sub.icptCharge !== undefined && (
                                    <div>
                                      <span className="text-slate-400 block">ICPT:</span> <span className="font-bold text-slate-700">RM{sub.icptCharge.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {sub.kwtbbCharge !== undefined && (
                                    <div>
                                      <span className="text-slate-400 block">KWTBB (1.6%):</span> <span className="font-bold text-slate-700">RM{sub.kwtbbCharge.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {sub.amountPayable !== undefined && (
                                    <div>
                                      <span className="text-slate-400 block">Caj Semasa:</span> <span className="font-black text-indigo-600">RM{sub.amountPayable.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {sub.currentCharge !== undefined && (
                                    <div>
                                      <span className="text-slate-400 block">Jumlah Bil:</span> <span className="font-black text-indigo-700 font-bold">RM{sub.currentCharge.toFixed(2)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {sub.notes && (
                          <div className="mt-2 text-xs text-slate-400 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                            {sub.notes}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-8 font-black text-indigo-700 text-xl">
                      <div className="space-y-1">
                        <div>{sub.emissionsKgCO2e.toFixed(1)} <span className="text-xs opacity-50">kg</span></div>
                        <div className="text-[10px] text-slate-400 font-semibold leading-tight">Value: {sub.activityValue} {sub.unit}</div>
                      </div>
                    </td>
                    <td className="px-8 py-8 text-slate-400 font-semibold text-sm whitespace-nowrap">{new Date(sub.timestamp).toLocaleDateString()}</td>
                    <td className="px-8 py-8 text-center">
                      {pendingDeleteId === sub.id ? (
                        <div className="flex items-center justify-center gap-2 animate-in slide-in-from-right-2 duration-150">
                          <button 
                            onClick={async () => {
                              await DB.deleteSubmission(sub.id);
                              setPendingDeleteId(null);
                              onRefresh();
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 text-[10px] rounded-lg shadow-sm transition-all animate-none"
                            title="Confirm Delete"
                          >
                            Delete
                          </button>
                          <button 
                            onClick={() => setPendingDeleteId(null)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold px-3 py-1.5 text-[10px] rounded-lg transition-all"
                            title="Cancel"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setPendingDeleteId(sub.id)}
                          className="p-2.5 text-rose-500 hover:text-white hover:bg-rose-500 rounded-xl transition-all shadow-sm border border-transparent hover:border-rose-100"
                          title="Delete entry"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showClearConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 text-slate-800 animate-in zoom-in-95 duration-200 relative">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-6 border border-rose-100">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-slate-900">Clear All Emissions Data?</h3>
            <p className="text-slate-500 text-xs font-semibold leading-relaxed mt-2">
              This action will permanently delete all {submissions.length} compiled Scope 3 submissions from this browser's local storage. This cannot be undone.
            </p>
            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-3 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200/55 rounded-xl font-black text-xs transition-all"
              >
                No, Cancel
              </button>
              <button 
                onClick={async () => {
                  await DB.clearAll();
                  setShowClearConfirm(false);
                  onRefresh();
                }}
                className="flex-1 py-3 text-white bg-rose-600 hover:bg-rose-700 rounded-xl font-black text-xs shadow-md shadow-rose-100 transition-all"
              >
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  const [submissions, setSubmissions] = useState<SubmissionData[]>([]);

  useEffect(() => {
    DB.getSubmissions().then(setSubmissions).catch(console.error);
  }, []);

  useEffect(() => {
    const handleHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const refreshSubmissions = () => {
    DB.getSubmissions().then(setSubmissions).catch(console.error);
  };

  const route = hash.split('?')[0];
  const params = new URLSearchParams(hash.split('?')[1] || '');

  const renderContent = () => {
    if (route === '#submit') {
      return (
        <SubmissionTool 
          prefill={{
            buyer: params.get('buyer') || undefined,
            type: params.get('type') || undefined,
            period: params.get('period') || undefined
          }} 
          onSubmissionSaved={refreshSubmissions}
        />
      );
    }

    return (
      <div className="space-y-4">
        <SubmissionTool onSubmissionSaved={refreshSubmissions} />
        <HistoryPage submissions={submissions} onRefresh={refreshSubmissions} />
      </div>
    );
  };

  return <Layout>{renderContent()}</Layout>;
}
