import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  History,
  LogOut,
  Trash2,
  Lock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Calculator,
  Sparkles,
  BookOpen,
  Search,
  Database,
  Mail,
  FileText,
  TrendingUp,
  Activity,
  ShieldAlert,
  Coins,
  Edit2,
  UploadCloud,
  Layers,
  FileCode
} from 'lucide-react';
import { insforge } from './lib/insforge';
import { calculateRatios, evaluateRatios } from './utils/financialMath';
import type { FinancialInputs } from './utils/financialMath';
import {
  sanitizeString,
  validateRatioInputs,
  validateJournalInputs,
  validateAdjustmentInputs,
  computeClientCsrfToken
} from './utils/security';

const formatAiReport = (text: string) => {
  if (!text) return '';
  
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  let formatted = escaped.replace(/```html|```/gi, '').trim();
  formatted = formatted.replace(/\bhtml\b/gi, '').trim();
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="text-purple-400 font-bold">$1</strong>');
  
  const lines = formatted.split('\n').map(p => p.trim()).filter(Boolean);
  return lines.map(line => {
    return `<p class="text-slate-200 text-sm leading-relaxed mb-3 font-sans tracking-wide">${line}</p>`;
  }).join('');
};

const getCsrfHeaders = async () => {
  const token = (insforge.getHttpClient() as any)?.tokenManager?.getAccessToken() || null;
  const csrfToken = await computeClientCsrfToken(token);
  return {
    'X-CSRF-Token': csrfToken
  };
};

interface FormInputs {
  companyName: string;
  fiscalYear: string;
  currentAssets: string;
  currentLiabilities: string;
  inventory: string;
  cashAndEquivalents: string;
  costOfGoodsSold: string;
  revenue: string;
  netProfit: string;
  totalAssets: string;
  totalDebt: string;
  shareholdersEquity: string;
  ebit: string;
  interestExpense: string;
  fixedAssets: string;
}

const initialFormInputs: FormInputs = {
  companyName: 'Acme Global Corp',
  fiscalYear: '2025',
  currentAssets: '1200000',
  currentLiabilities: '600000',
  inventory: '300000',
  cashAndEquivalents: '400000',
  costOfGoodsSold: '1800000',
  revenue: '3000000',
  netProfit: '450000',
  totalAssets: '2500000',
  totalDebt: '800000',
  shareholdersEquity: '1500000',
  ebit: '600000',
  interestExpense: '80000',
  fixedAssets: '1800000',
};

// Journal entry interface
interface JournalEntry {
  id: string;
  user_id: string;
  date: string;
  debit_account: string;
  credit_account: string;
  amount: number;
  narration: string;
}

// Stage parsed transaction entry
interface StagedTransaction {
  debitAccount: string;
  creditAccount: string;
  amount: number;
  narration: string;
  date: string;
}

type ActivePage = 'ratios' | 'journal' | 'ledgers' | 'trialBalance' | 'statements' | 'history' | 'guide' | 'profile';
type FormTab = 'manual' | 'ai-scan';
type JournalTab = 'list' | 'manual-form' | 'nlp-input' | 'file-upload';

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>('ratios');
  const [formTab, setFormTab] = useState<FormTab>('manual');
  const [journalTab, setJournalTab] = useState<JournalTab>('list');

  // Auth & Session
  const [user, setUser] = useState<any>(null);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isOtpOpen, setIsOtpOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [isResendingOtp, setIsResendingOtp] = useState(false);

  // Notifications
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Ratio calculator state
  const [formInputs, setFormInputs] = useState<FormInputs>(initialFormInputs);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanText, setScanText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Core Accounting state
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [isLoadingJournal, setIsLoadingJournal] = useState(false);
  const [isSavingJournal, setIsSavingJournal] = useState(false);
  
  // Journal Form
  const [journalForm, setJournalForm] = useState({
    id: '', // Empty means creating new
    date: new Date().toISOString().substring(0, 10),
    accountName: '',
    amount: '',
    nature: 'Dr' as 'Dr' | 'Cr',
    counterAccount: '',
    narration: ''
  });

  // NLP Transaction parse inputs
  const [nlpText, setNlpText] = useState('');
  const [isParsingNlp, setIsParsingNlp] = useState(false);

  // File upload staging
  const [stagedEntries, setStagedEntries] = useState<StagedTransaction[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');

  // Ledgers Edge Function result
  const [ledgerAccounts, setLedgerAccounts] = useState<Record<string, { debits: any[], credits: any[] }>>({});
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  // Trial Balance Edge Function result
  const [trialBalanceList, setTrialBalanceList] = useState<any[]>([]);
  const [isLoadingTrialBalance, setIsLoadingTrialBalance] = useState(false);

  // Financial Statements Edge Function result
  const [statementData, setStatementData] = useState<any>(null);
  const [isLoadingStatements, setIsLoadingStatements] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false); // Adjustments slideout panel
  const [adjustments, setAdjustments] = useState({
    closingInventory: '0',
    depreciation: '0',
    accruedExpense: '0'
  });

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Load current user session on startup
  useEffect(() => {
    async function initSession() {
      try {
        const { data, error } = await insforge.auth.getCurrentUser();
        if (data && data.user && !error) {
          setUser(data.user);
        }
      } catch (err) {
        console.error('Session init error:', err);
      } finally {
        setIsAppLoading(false);
      }
    }
    initSession();
  }, []);

  // Fetch all user records on auth state change
  useEffect(() => {
    if (user) {
      fetchHistory();
      fetchJournal();
    } else {
      setHistory([]);
      setJournalEntries([]);
    }
  }, [user]);

  // Reactivity: downstream schema update triggers when journal changes
  useEffect(() => {
    if (user && journalEntries.length >= 0) {
      fetchDownstreamData();
    }
  }, [journalEntries]);

  // Downstream computation pipeline via edge functions
  const fetchDownstreamData = async () => {
    if (!user) return;
    fetchLedgerData();
    fetchTrialBalanceData();
  };

  useEffect(() => {
    if (user) {
      fetchStatementData();
    }
  }, [trialBalanceList, adjustments]);

  // Fetch Ledger data from Edge Function
  const fetchLedgerData = async () => {
    setIsLoadingLedger(true);
    try {
      const csrfHeaders = await getCsrfHeaders();
      const { data, error } = await insforge.functions.invoke('ledgerCreation', {
        method: 'POST',
        headers: csrfHeaders
      });
      if (!error && data && data.ledgers) {
        setLedgerAccounts(data.ledgers);
      }
    } catch (err) {
      console.error('Ledger Edge Function error:', err);
    } finally {
      setIsLoadingLedger(false);
    }
  };

  // Fetch Trial Balance data from Edge Function
  const fetchTrialBalanceData = async () => {
    setIsLoadingTrialBalance(true);
    try {
      const csrfHeaders = await getCsrfHeaders();
      const { data, error } = await insforge.functions.invoke('trialBalanceCreation', {
        method: 'POST',
        headers: csrfHeaders
      });
      if (!error && data && data.trialBalance) {
        setTrialBalanceList(data.trialBalance);
      }
    } catch (err) {
      console.error('Trial Balance Edge Function error:', err);
    } finally {
      setIsLoadingTrialBalance(false);
    }
  };

  // Fetch Financial Statements data from Edge Function
  const fetchStatementData = async () => {
    const validation = validateAdjustmentInputs(adjustments);
    if (!validation.success) {
      setNotification({ type: 'error', message: `Adjustments validation error: ${validation.errors.join(' ')}` });
      return;
    }

    setIsLoadingStatements(true);
    try {
      const csrfHeaders = await getCsrfHeaders();
      const { data, error } = await insforge.functions.invoke('financialStatementCreation', {
        method: 'POST',
        body: {
          closingInventory: parseFloat(adjustments.closingInventory) || 0,
          depreciation: parseFloat(adjustments.depreciation) || 0,
          accruedExpense: parseFloat(adjustments.accruedExpense) || 0
        },
        headers: csrfHeaders
      });
      if (!error && data) {
        setStatementData(data);
      }
    } catch (err) {
      console.error('Financial Statements Edge Function error:', err);
    } finally {
      setIsLoadingStatements(false);
    }
  };

  // Fetch corporate ratios history records
  async function fetchHistory() {
    if (!user) return;
    setIsLoadingHistory(true);
    try {
      const { data, error } = await insforge.database
        .from('financial_records')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching records:', error);
      } else if (data) {
        setHistory(data);
        if (data.length > 0 && !selectedRecordId) {
          loadRecordIntoForm(data[0]);
        }
      }
    } catch (err) {
      console.error('Database fetch error:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  // Fetch double-entry journal entries from cloud database
  async function fetchJournal() {
    if (!user) return;
    setIsLoadingJournal(true);
    try {
      const { data, error } = await insforge.database
        .from('journal_entries')
        .select('*')
        .order('date', { ascending: false });

      if (error) {
        console.error('Error fetching journal:', error);
      } else if (data) {
        setJournalEntries(data);
      }
    } catch (err) {
      console.error('Journal fetch error:', err);
    } finally {
      setIsLoadingJournal(false);
    }
  }

  // Seed default journal entries if journal is empty
  const handleSeedJournal = async () => {
    if (!user) return;
    setIsSavingJournal(true);
    const mockJournals = [
      {
        user_id: user.id,
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        debit_account: 'Cash A/c',
        credit_account: 'Capital A/c',
        amount: 800000,
        narration: 'Being business started with cash capital'
      },
      {
        user_id: user.id,
        date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        debit_account: 'Purchases A/c',
        credit_account: 'Creditor ABC A/c',
        amount: 300000,
        narration: 'Being goods purchased on credit from Creditor ABC'
      },
      {
        user_id: user.id,
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        debit_account: 'Cash A/c',
        credit_account: 'Sales A/c',
        amount: 550000,
        narration: 'Being cash sales completed'
      },
      {
        user_id: user.id,
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        debit_account: 'Rent Expense A/c',
        credit_account: 'Cash A/c',
        amount: 25000,
        narration: 'Being office rent paid in cash'
      },
      {
        user_id: user.id,
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        debit_account: 'Office Equipment A/c',
        credit_account: 'Cash A/c',
        amount: 150000,
        narration: 'Being computers purchased for cash'
      }
    ];

    try {
      const { error } = await insforge.database
        .from('journal_entries')
        .insert(mockJournals)
        .select();

      if (error) {
        setNotification({ type: 'error', message: error.message });
      } else {
        setNotification({ type: 'success', message: 'Seeded default double-entry transactions!' });
        fetchJournal();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error seeding ledger entries' });
    } finally {
      setIsSavingJournal(false);
    }
  };

  // Clear ratio calculator input values
  const loadRecordIntoForm = (record: any) => {
    setSelectedRecordId(record.id);
    setFormInputs({
      companyName: record.company_name,
      fiscalYear: record.fiscal_year.toString(),
      currentAssets: record.current_assets.toString(),
      currentLiabilities: record.current_liabilities.toString(),
      inventory: record.inventory.toString(),
      cashAndEquivalents: record.cash_and_equivalents.toString(),
      costOfGoodsSold: record.cost_of_goods_sold.toString(),
      revenue: record.revenue.toString(),
      netProfit: record.net_profit.toString(),
      totalAssets: (record.total_assets || 0).toString(),
      totalDebt: (record.total_debt || 0).toString(),
      shareholdersEquity: (record.shareholders_equity || 0).toString(),
      ebit: (record.ebit || 0).toString(),
      interestExpense: (record.interest_expense || 0).toString(),
      fixedAssets: (record.fixed_assets || 0).toString(),
    });
  };

  const handleNewSession = () => {
    setSelectedRecordId(null);
    setFormInputs({
      companyName: '',
      fiscalYear: new Date().getFullYear().toString(),
      currentAssets: '',
      currentLiabilities: '',
      inventory: '',
      cashAndEquivalents: '',
      costOfGoodsSold: '',
      revenue: '',
      netProfit: '',
      totalAssets: '',
      totalDebt: '',
      shareholdersEquity: '',
      ebit: '',
      interestExpense: '',
      fixedAssets: '',
    });
    setNotification({ type: 'success', message: 'Calculator inputs cleared.' });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormInputs(prev => ({ ...prev, [name]: value }));
  };

  const parseInputValue = (val: string): number => {
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  };

  const mathInputs: FinancialInputs = {
    currentAssets: parseInputValue(formInputs.currentAssets),
    currentLiabilities: parseInputValue(formInputs.currentLiabilities),
    inventory: parseInputValue(formInputs.inventory),
    cashAndEquivalents: parseInputValue(formInputs.cashAndEquivalents),
    costOfGoodsSold: parseInputValue(formInputs.costOfGoodsSold),
    revenue: parseInputValue(formInputs.revenue),
    netProfit: parseInputValue(formInputs.netProfit),
    totalAssets: parseInputValue(formInputs.totalAssets),
    totalDebt: parseInputValue(formInputs.totalDebt),
    shareholdersEquity: parseInputValue(formInputs.shareholdersEquity),
    ebit: parseInputValue(formInputs.ebit),
    interestExpense: parseInputValue(formInputs.interestExpense),
    fixedAssets: parseInputValue(formInputs.fixedAssets),
  };

  const calculatedRatios = calculateRatios(mathInputs);
  const evaluations = evaluateRatios(calculatedRatios);

  // Authenticate (Sign In)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) return;
    setAuthError(null);
    setAuthSuccess(null);

    try {
      const { data, error } = await insforge.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });

      if (error) {
        setAuthError(error.message);
      } else if (data) {
        setUser(data.user);
        setAuthEmail('');
        setAuthPassword('');
        setNotification({ type: 'success', message: 'Signed in successfully!' });
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    }
  };

  // Register (Sign Up)
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) return;
    setAuthError(null);
    setAuthSuccess(null);

    try {
      const { error } = await insforge.auth.signUp({
        email: authEmail,
        password: authPassword,
      });

      if (error) {
        setAuthError(error.message);
      } else {
        await insforge.auth.resendVerificationEmail({ email: authEmail });
        setIsOtpOpen(true);
        setAuthSuccess('Verification code sent to your email!');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed');
    }
  };

  // OTP Verification
  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) return;
    setAuthError(null);
    setAuthSuccess(null);

    try {
      const { data, error } = await insforge.auth.verifyEmail({
        email: authEmail,
        otp: otpCode,
      });

      if (error) {
        setAuthError(error.message);
      } else if (data) {
        setUser(data.user);
        setIsOtpOpen(false);
        setAuthEmail('');
        setAuthPassword('');
        setOtpCode('');
        setNotification({ type: 'success', message: 'Email verified and logged in!' });
      }
    } catch (err: any) {
      setAuthError(err.message || 'Verification failed');
    }
  };

  // Resend OTP Code
  const handleResendOtp = async () => {
    if (!authEmail) return;
    setIsResendingOtp(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      const { data, error } = await insforge.auth.resendVerificationEmail({ email: authEmail });
      if (error) {
        setAuthError(error.message);
      } else if (data?.success) {
        setAuthSuccess('A new verification code was sent to your email.');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Resend failed. Please try again.');
    } finally {
      setIsResendingOtp(false);
    }
  };

  // Google OAuth Login
  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await insforge.auth.signInWithOAuth('google', { redirectTo: window.location.origin });
    } catch (err: any) {
      setAuthError(err.message || 'Google Login failed');
    }
  };

  // Sign Out
  const handleSignOut = async () => {
    try {
      await insforge.auth.signOut();
      setUser(null);
      setSelectedRecordId(null);
      setFormInputs(initialFormInputs);
      setActivePage('ratios');
      setNotification({ type: 'success', message: 'Logged out successfully.' });
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // Save Calculator Data to InsForge Database
  const handleSaveToCloud = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;
    
    const validation = validateRatioInputs(formInputs);
    if (!validation.success) {
      setNotification({ type: 'error', message: validation.errors.join(' ') });
      return;
    }

    setIsSaving(true);
    const yearVal = parseInt(formInputs.fiscalYear);
    const sanitizedCompanyName = sanitizeString(formInputs.companyName);

    const recordPayload = {
      user_id: user.id,
      company_name: sanitizedCompanyName,
      fiscal_year: isNaN(yearVal) ? new Date().getFullYear() : yearVal,
      current_assets: mathInputs.currentAssets,
      current_liabilities: mathInputs.currentLiabilities,
      inventory: mathInputs.inventory,
      cash_and_equivalents: mathInputs.cashAndEquivalents,
      cost_of_goods_sold: mathInputs.costOfGoodsSold,
      revenue: mathInputs.revenue,
      net_profit: mathInputs.netProfit,
      total_assets: mathInputs.totalAssets,
      total_debt: mathInputs.totalDebt,
      shareholders_equity: mathInputs.shareholdersEquity,
      ebit: mathInputs.ebit,
      interest_expense: mathInputs.interestExpense,
      fixed_assets: mathInputs.fixedAssets,
      updated_at: new Date().toISOString(),
    };

    try {
      if (selectedRecordId) {
        const { error } = await insforge.database
          .from('financial_records')
          .update(recordPayload)
          .eq('id', selectedRecordId);

        if (error) {
          setNotification({ type: 'error', message: error.message });
        } else {
          setNotification({ type: 'success', message: 'Record updated successfully!' });
          fetchHistory();
        }
      } else {
        const { data, error } = await insforge.database
          .from('financial_records')
          .insert([recordPayload])
          .select();

        if (error) {
          setNotification({ type: 'error', message: error.message });
        } else if (data && data.length > 0) {
          setSelectedRecordId(data[0].id);
          setNotification({ type: 'success', message: 'Record saved to cloud!' });
          fetchHistory();
        }
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error saving record' });
    } finally {
      setIsSaving(false);
    }
  };

  // Seed corporate ratios template
  const handleLoadSample = async () => {
    if (!user) return;
    setIsSaving(true);
    const samplePayload = {
      user_id: user.id,
      company_name: 'Acme Global Corp (Sample)',
      fiscal_year: 2025,
      current_assets: 1200000,
      current_liabilities: 600000,
      inventory: 300000,
      cash_and_equivalents: 400000,
      cost_of_goods_sold: 1800000,
      revenue: 3000000,
      net_profit: 450000,
      total_assets: 2500000,
      total_debt: 800000,
      shareholders_equity: 1500000,
      ebit: 600000,
      interest_expense: 80000,
      fixed_assets: 1800000,
      updated_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await insforge.database
        .from('financial_records')
        .insert([samplePayload])
        .select();

      if (error) {
        setNotification({ type: 'error', message: error.message });
      } else if (data && data.length > 0) {
        loadRecordIntoForm(data[0]);
        setNotification({ type: 'success', message: 'Sample template loaded and saved!' });
        fetchHistory();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error seeding sample' });
    } finally {
      setIsSaving(false);
    }
  };

  // AI Financial Statement Scanner (Ratio Form auto-filler)
  const handleScanStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedScan = sanitizeString(scanText.trim());
    if (!sanitizedScan) {
      setNotification({ type: 'error', message: 'Please paste financial statement text first or select a file.' });
      return;
    }
    setIsScanning(true);
    setNotification(null);

    try {
      const systemPrompt = `You are a financial scanning assistant. Extract accounting parameters from raw statement texts. 
Return ONLY a valid JSON object matching the structure below. Do not include any comments, formatting tags (such as \`\`\`json), or explanations.

Required JSON format:
{
  "companyName": "extracted company name (or 'Acme Corp')",
  "fiscalYear": "year as string (e.g. '2025')",
  "currentAssets": "number as string (e.g. '1200000')",
  "currentLiabilities": "number as string",
  "inventory": "number as string",
  "cashAndEquivalents": "number as string",
  "costOfGoodsSold": "number as string",
  "revenue": "number as string",
  "netProfit": "number as string",
  "totalAssets": "number as string",
  "totalDebt": "number as string",
  "shareholdersEquity": "number as string",
  "ebit": "number as string",
  "interestExpense": "number as string",
  "fixedAssets": "number as string"
}`;

      const response = await insforge.ai.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: sanitizedScan }
        ]
      });

      if (response && response.choices && response.choices.length > 0) {
        const rawText = response.choices[0].message.content.trim();
        const jsonText = rawText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(jsonText);
        
        setFormInputs({
          companyName: parsed.companyName || 'Extracted Company',
          fiscalYear: parsed.fiscalYear || new Date().getFullYear().toString(),
          currentAssets: parsed.currentAssets || '0',
          currentLiabilities: parsed.currentLiabilities || '0',
          inventory: parsed.inventory || '0',
          cashAndEquivalents: parsed.cashAndEquivalents || '0',
          costOfGoodsSold: parsed.costOfGoodsSold || '0',
          revenue: parsed.revenue || '0',
          netProfit: parsed.netProfit || '0',
          totalAssets: parsed.totalAssets || '0',
          totalDebt: parsed.totalDebt || '0',
          shareholdersEquity: parsed.shareholdersEquity || '0',
          ebit: parsed.ebit || '0',
          interestExpense: parsed.interestExpense || '0',
          fixedAssets: parsed.fixedAssets || '0'
        });
        setNotification({ type: 'success', message: 'Financial statement successfully scanned!' });
        setScanText('');
        setFormTab('manual');
      } else {
        setNotification({ type: 'error', message: 'AI failed to parse statement text.' });
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      setNotification({ type: 'error', message: err.message || 'Error scanning statement text' });
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setScanText(text);
      setNotification({ type: 'success', message: `Loaded file: ${file.name}` });
    };
    reader.readAsText(file);
  };

  // AI Financial Diagnosis Report (Invoking the deployed generateInsights Edge Function)
  const handleGenerateAiReport = async () => {
    setIsGeneratingReport(true);
    setNotification(null);
    try {
      const csrfHeaders = await getCsrfHeaders();
      const { data, error } = await insforge.functions.invoke('generateInsights', {
        method: 'POST',
        headers: csrfHeaders
      });

      if (error) {
        setNotification({ type: 'error', message: error.message });
      } else if (data && data.insight) {
        setAiReport(data.insight);
        setNotification({ type: 'success', message: 'AI Expense Insights generated!' });
      } else if (data && data.error) {
        setNotification({ type: 'error', message: data.error });
      } else {
        setNotification({ type: 'error', message: 'Failed to generate insights.' });
      }
    } catch (err: any) {
      console.error('AI edge function error:', err);
      setNotification({ type: 'error', message: err.message || 'Error generating insights' });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDeleteRecord = async (recordId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this financial record?')) return;
    try {
      const { error } = await insforge.database
        .from('financial_records')
        .delete()
        .eq('id', recordId);

      if (error) {
        setNotification({ type: 'error', message: error.message });
      } else {
        setNotification({ type: 'success', message: 'Record deleted.' });
        if (selectedRecordId === recordId) {
          setSelectedRecordId(null);
        }
        fetchHistory();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error deleting record' });
    }
  };

  // ----------------------------------------------------
  // JOURNAL ENTRIES HANDLERS
  // ----------------------------------------------------

  // Journal double-entry CRUD: insert / update
  const handleSaveJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Validate inputs using security library
    const validation = validateJournalInputs(journalForm);
    if (!validation.success) {
      setNotification({ type: 'error', message: validation.errors.join(' ') });
      return;
    }

    setIsSavingJournal(true);

    // Sanitize string inputs to mitigate XSS
    const sanitizedAccountName = sanitizeString(journalForm.accountName);
    const sanitizedCounterAccount = sanitizeString(journalForm.counterAccount);
    const sanitizedNarration = sanitizeString(journalForm.narration);

    const isDebit = journalForm.nature === 'Dr';
    const debitAccount = isDebit ? sanitizedAccountName : sanitizedCounterAccount;
    const creditAccount = isDebit ? sanitizedCounterAccount : sanitizedAccountName;

    const payload = {
      user_id: user.id,
      date: new Date(journalForm.date).toISOString(),
      debit_account: debitAccount,
      credit_account: creditAccount,
      amount: parseFloat(journalForm.amount),
      narration: sanitizedNarration || `Being ${sanitizedAccountName} posted to ${sanitizedCounterAccount}`
    };

    try {
      if (journalForm.id) {
        // Edit existing entry
        const { error } = await insforge.database
          .from('journal_entries')
          .update(payload)
          .eq('id', journalForm.id);

        if (error) {
          setNotification({ type: 'error', message: error.message });
        } else {
          setNotification({ type: 'success', message: 'Journal transaction updated!' });
          setJournalTab('list');
          fetchJournal();
        }
      } else {
        // Insert new entry
        const { error } = await insforge.database
          .from('journal_entries')
          .insert([payload]);

        if (error) {
          setNotification({ type: 'error', message: error.message });
        } else {
          setNotification({ type: 'success', message: 'Journal transaction recorded successfully!' });
          setJournalForm({
            id: '',
            date: new Date().toISOString().substring(0, 10),
            accountName: '',
            amount: '',
            nature: 'Dr',
            counterAccount: '',
            narration: ''
          });
          setJournalTab('list');
          fetchJournal();
        }
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error saving transaction' });
    } finally {
      setIsSavingJournal(false);
    }
  };

  // Populate manual form to edit transaction
  const handleEditJournal = (entry: JournalEntry) => {
    setJournalForm({
      id: entry.id,
      date: entry.date.substring(0, 10),
      accountName: entry.debit_account,
      amount: entry.amount.toString(),
      nature: 'Dr',
      counterAccount: entry.credit_account,
      narration: entry.narration
    });
    setJournalTab('manual-form');
  };

  // Delete transaction from cloud
  const handleDeleteJournal = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this journal transaction?')) return;
    try {
      const { error } = await insforge.database
        .from('journal_entries')
        .delete()
        .eq('id', id);

      if (error) {
        setNotification({ type: 'error', message: error.message });
      } else {
        setNotification({ type: 'success', message: 'Transaction deleted.' });
        fetchJournal();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error deleting transaction' });
    }
  };

  // Method A: NLP Transaction parsing via AI completing proxy
  const handleNlpParse = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedNlp = sanitizeString(nlpText.trim());
    if (!sanitizedNlp) {
      setNotification({ type: 'error', message: 'Transaction description is invalid or empty.' });
      return;
    }
    
    setIsParsingNlp(true);
    setNotification(null);

    try {
      const prompt = `Identify transaction parameters from this accounting transaction description: "${sanitizedNlp}".
Return ONLY a valid JSON object matching this structure. Do NOT wrap in \`\`\`json markdown blocks or include comments:
{
  "debitAccount": "Name of debited account (capitalized, e.g. 'Cash A/c' or 'Purchases A/c')",
  "creditAccount": "Name of credited account (capitalized, e.g. 'Sales A/c' or 'Capital A/c')",
  "amount": number,
  "narration": "Being standard narration string"
}`;

      const response = await insforge.ai.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }]
      });

      if (response && response.choices && response.choices.length > 0) {
        const rawText = response.choices[0].message.content.trim();
        const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(cleanJson);

        setJournalForm({
          id: '',
          date: new Date().toISOString().substring(0, 10),
          accountName: parsed.debitAccount || 'Cash A/c',
          amount: (parsed.amount || 0).toString(),
          nature: 'Dr',
          counterAccount: parsed.creditAccount || 'Capital A/c',
          narration: parsed.narration || `Being NLP parsed: ${sanitizedNlp}`
        });

        setNotification({ type: 'success', message: 'Transaction analyzed successfully! Review and post below.' });
        setJournalTab('manual-form');
        setNlpText('');
      } else {
        setNotification({ type: 'error', message: 'AI failed to analyze transaction parameters.' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'AI parsing error' });
    } finally {
      setIsParsingNlp(false);
    }
  };

  // Method C: Batch file uploader + Storage SDK integration
  const handleBatchFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation checks
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      setNotification({ type: 'error', message: 'Payload Too Large: File size exceeds the 5MB limit.' });
      return;
    }

    const allowedExtensions = ['.txt', '.csv'];
    const fileNameLower = file.name.toLowerCase();
    const isAllowedExtension = allowedExtensions.some(ext => fileNameLower.endsWith(ext));
    if (!isAllowedExtension) {
      setNotification({ type: 'error', message: 'Unsupported Media Type: Only .txt and .csv files are allowed.' });
      return;
    }

    setIsUploadingFile(true);
    setUploadedFileName(file.name);
    setNotification(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const csrfHeaders = await getCsrfHeaders();
      const { data, error } = await insforge.functions.invoke('ingestLedger', {
        method: 'POST',
        body: formData,
        headers: csrfHeaders
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data && data.stagedTransactions) {
        setStagedEntries(data.stagedTransactions);
        setNotification({
          type: 'success',
          message: `Successfully uploaded ${file.name} to /transactions and parsed ${data.stagedTransactions.length} transactions!`
        });
      } else {
        throw new Error('Invalid response payload from Edge Function');
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'File batch upload failed' });
    } finally {
      setIsUploadingFile(false);
    }
  };

  // Bulk save all staged entries from file uploader
  const handleSaveStaged = async () => {
    if (stagedEntries.length === 0 || !user) return;
    setIsSavingJournal(true);
    
    const payloads = stagedEntries.map(entry => ({
      user_id: user.id,
      date: entry.date,
      debit_account: entry.debitAccount,
      credit_account: entry.creditAccount,
      amount: entry.amount,
      narration: entry.narration
    }));

    try {
      const { error } = await insforge.database
        .from('journal_entries')
        .insert(payloads);

      if (error) {
        setNotification({ type: 'error', message: error.message });
      } else {
        setNotification({ type: 'success', message: `Journalized ${payloads.length} batch transactions!` });
        setStagedEntries([]);
        setUploadedFileName('');
        setJournalTab('list');
        fetchJournal();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error saving batch' });
    } finally {
      setIsSavingJournal(false);
    }
  };

  // Format currency helpers
  const formatCurrency = (val: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Standard vertical date format helper
  const renderVerticalDate = (dateString: string) => {
    const d = new Date(dateString);
    const year = d.getFullYear();
    const month = d.toLocaleString('default', { month: 'short' }).toUpperCase();
    const day = String(d.getDate()).padStart(2, '0');
    return (
      <div className="flex flex-col items-center justify-center font-mono text-xs font-semibold leading-tight text-slate-400">
        <div className="text-white text-sm font-black">{day}</div>
        <div className="text-purple-400 font-bold text-[10px] my-0.5">{month}</div>
        <div>{year}</div>
      </div>
    );
  };

  const getStatusClasses = (status: 'optimal' | 'warning' | 'critical') => {
    switch (status) {
      case 'optimal':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'warning':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'critical':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    }
  };

  const filteredHistory = history.filter(record => 
    record.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    record.fiscal_year.toString().includes(searchQuery)
  );

  if (isAppLoading) {
    return (
      <div className="min-h-screen text-slate-100 bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
          <span className="text-sm text-slate-400">Loading workspace...</span>
        </div>
      </div>
    );
  }

  // Force login view if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen text-slate-100 bg-slate-950 flex items-center justify-center p-4 selection:bg-purple-600/30">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 blur-3xl pointer-events-none rounded-full"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 blur-3xl pointer-events-none rounded-full"></div>
        
        <div className="glass w-full max-w-md rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-2xl relative z-10">
          
          <div className="flex flex-col items-center text-center mb-6">
            <div className="p-3 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-2xl shadow-lg shadow-purple-500/20 mb-4">
              <Calculator className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight m-0">Balansify</h1>
            <p className="text-xs text-slate-400 mt-2">
              Core Double-Entry Ledger & Financial Statement Architecture
            </p>
          </div>

          {!isOtpOpen && (
            <div className="grid grid-cols-2 bg-slate-900/50 p-1.5 rounded-xl border border-slate-800/80 mb-6">
              <button
                onClick={() => { setAuthMode('login'); setAuthError(null); }}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  authMode === 'login' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setAuthMode('register'); setAuthError(null); }}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  authMode === 'register' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {authError && (
            <div className="mb-4 flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {authSuccess && (
            <div className="mb-4 flex items-start gap-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-3 rounded-xl">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authSuccess}</span>
            </div>
          )}

          {!isOtpOpen ? (
            <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-10 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-10 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all placeholder:text-slate-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-650 hover:from-purple-500 hover:to-indigo-500 rounded-xl text-sm font-semibold text-white transition-all shadow-lg shadow-purple-500/20 hover:shadow-purple-500/35 cursor-pointer mt-2"
              >
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>

              <div className="my-5 flex items-center justify-center text-[10px] text-slate-500 uppercase tracking-widest">
                Or continue with
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800/80 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                </svg>
                <span>Google Account</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpVerify} className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-xs text-slate-400">
                  Enter the 6-digit code sent to your email to verify your address.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Verification Code</label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  className="w-full text-center bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3 py-3 text-lg font-mono tracking-widest text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all placeholder:text-slate-700"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-650 hover:from-purple-500 hover:to-indigo-500 rounded-xl text-sm font-semibold text-white transition-all shadow-lg shadow-purple-500/20 hover:shadow-purple-500/35 cursor-pointer"
              >
                Verify & Login
              </button>

              <div className="flex flex-col gap-2 pt-2 text-center">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isResendingOtp}
                  className="text-xs text-purple-400 hover:text-purple-300 font-semibold transition-all disabled:text-slate-600 flex items-center justify-center gap-1.5 self-center"
                >
                  {isResendingOtp ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Resending...</span>
                    </>
                  ) : (
                    <span>Resend OTP Code</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsOtpOpen(false); setAuthError(null); setAuthSuccess(null); }}
                  className="text-xs text-slate-500 hover:text-slate-400 font-medium transition-all"
                >
                  Back to Registration
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-100 bg-slate-950 font-sans flex flex-col selection:bg-purple-600/30">
      
      {notification && (
        <div className="fixed top-6 right-6 z-50 animate-bounce duration-300 max-w-sm">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border glass shadow-2xl ${
            notification.type === 'success' ? 'border-emerald-500/30' : 'border-rose-500/30'
          }`}>
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="text-sm font-medium text-slate-200">{notification.message}</span>
          </div>
        </div>
      )}

      {/* Top Header Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-tr from-purple-600 to-indigo-650 rounded-xl shadow-lg shadow-purple-500/20">
                <Calculator className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-base font-extrabold tracking-tight text-white m-0 leading-none">Balansify</h1>
            </div>
            
            <nav className="hidden xl:flex items-center gap-1 border-l border-slate-800 pl-6 h-8">
              <button
                onClick={() => setActivePage('ratios')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activePage === 'ratios' ? 'bg-purple-600/10 text-purple-400 border border-purple-500/10' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Ratios Workspace</span>
              </button>
              <button
                onClick={() => setActivePage('journal')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activePage === 'journal' ? 'bg-purple-600/10 text-purple-400 border border-purple-500/10' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Journal</span>
              </button>
              <button
                onClick={() => setActivePage('ledgers')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activePage === 'ledgers' ? 'bg-purple-600/10 text-purple-400 border border-purple-500/10' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Ledger Accounts</span>
              </button>
              <button
                onClick={() => setActivePage('trialBalance')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activePage === 'trialBalance' ? 'bg-purple-600/10 text-purple-400 border border-purple-500/10' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Trial Balance</span>
              </button>
              <button
                onClick={() => setActivePage('statements')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activePage === 'statements' ? 'bg-purple-600/10 text-purple-400 border border-purple-500/10' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Financial Statements</span>
              </button>
              <button
                onClick={() => setActivePage('history')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activePage === 'history' ? 'bg-purple-600/10 text-purple-400 border border-purple-500/10' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Ratios Archive</span>
              </button>
              <button
                onClick={() => setActivePage('guide')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activePage === 'guide' ? 'bg-purple-600/10 text-purple-400 border border-purple-500/10' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>ICAI Guide</span>
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-[10px] text-slate-500">Workspace Connected</span>
              <span className="text-xs font-medium text-slate-300 truncate max-w-[150px]">{user.email}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-medium transition-all"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sub-header navigation tab list for non-xl screens */}
      <div className="xl:hidden flex items-center gap-1 overflow-x-auto bg-slate-900/30 p-2 border-b border-slate-900 whitespace-nowrap scrollbar-none">
        <button
          onClick={() => setActivePage('ratios')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 ${activePage === 'ratios' ? 'bg-purple-650 text-white' : 'text-slate-400'}`}
        >
          Ratios
        </button>
        <button
          onClick={() => setActivePage('journal')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 ${activePage === 'journal' ? 'bg-purple-655 text-white' : 'text-slate-400'}`}
        >
          Journal
        </button>
        <button
          onClick={() => setActivePage('ledgers')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 ${activePage === 'ledgers' ? 'bg-purple-655 text-white' : 'text-slate-400'}`}
        >
          Ledger
        </button>
        <button
          onClick={() => setActivePage('trialBalance')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 ${activePage === 'trialBalance' ? 'bg-purple-655 text-white' : 'text-slate-400'}`}
        >
          Trial Balance
        </button>
        <button
          onClick={() => setActivePage('statements')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 ${activePage === 'statements' ? 'bg-purple-655 text-white' : 'text-slate-400'}`}
        >
          Statements
        </button>
        <button
          onClick={() => setActivePage('history')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 ${activePage === 'history' ? 'bg-purple-655 text-white' : 'text-slate-400'}`}
        >
          Archive
        </button>
        <button
          onClick={() => setActivePage('guide')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 ${activePage === 'guide' ? 'bg-purple-655 text-white' : 'text-slate-400'}`}
        >
          Guide
        </button>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* ========================================================================= */}
        {/* PAGE 1: JOURNAL Ledger Entry */}
        {activePage === 'journal' && (
          <div className="flex flex-col gap-6">
            
            {/* Header controls block */}
            <div className="glass rounded-2xl p-5 border border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white m-0">Journal</h2>
                <p className="text-xs text-slate-400 mt-1 max-w-lg">
                  Natural Language AI processing and batch file staging fully synced to cloud databases.
                </p>
              </div>
              
              <div className="flex items-center gap-2.5 self-start md:self-auto">
                <button
                  onClick={() => setJournalTab('list')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    journalTab === 'list' ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  Journal Table
                </button>
                <button
                  onClick={() => setJournalTab('manual-form')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    journalTab === 'manual-form' ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  Manual Form
                </button>
                <button
                  onClick={() => setJournalTab('nlp-input')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    journalTab === 'nlp-input' ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-205 border border-slate-800'
                  }`}
                >
                  AI Text Input
                </button>
                <button
                  onClick={() => setJournalTab('file-upload')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    journalTab === 'file-upload' ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  File Batch Upload
                </button>
              </div>
            </div>

            {/* Sub-tab 1: NLP AI Input block */}
            {journalTab === 'nlp-input' && (
              <div className="glass rounded-2xl p-6 border border-slate-800 shadow-xl max-w-2xl mx-auto w-full space-y-4">
                <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  <span>A. AI Transaction Sentence Parser</span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Type a raw natural language statement (e.g. <em>"Sold machinery to Customer ABC for cash Rs 4,50,000"</em>) and the AI will extract the accounts and debit/credit mappings instantly.
                </p>
                <form onSubmit={handleNlpParse} className="space-y-4">
                  <textarea
                    value={nlpText}
                    onChange={(e) => setNlpText(e.target.value)}
                    placeholder="Purchased raw materials on credit from Supplier XYZ Rs. 1,80,000..."
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                  />
                  <button
                    type="submit"
                    disabled={isParsingNlp || !nlpText.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-tr from-purple-600 to-indigo-650 rounded-xl font-bold text-sm text-white transition-all cursor-pointer disabled:from-purple-800 disabled:to-indigo-850"
                  >
                    {isParsingNlp ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>AI Parsing transaction...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Analyze & Prep Leg Posting</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Sub-tab 2: Manual Form Entry */}
            {journalTab === 'manual-form' && (
              <div className="glass rounded-2xl p-6 border border-slate-800 shadow-xl max-w-xl mx-auto w-full">
                <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider mb-4">
                  {journalForm.id ? 'Edit Journal Transaction' : 'B. Manual Double-Entry Form'}
                </h3>
                
                <form onSubmit={handleSaveJournal} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-450 uppercase mb-1.5">Date</label>
                      <input
                        type="date"
                        required
                        value={journalForm.date}
                        onChange={(e) => setJournalForm(prev => ({ ...prev, date: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-455 uppercase mb-1.5">Amount (₹)</label>
                      <input
                        type="number"
                        placeholder="Amount in Rupees"
                        required
                        value={journalForm.amount}
                        onChange={(e) => setJournalForm(prev => ({ ...prev, amount: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-900/30 p-4 border border-slate-800 rounded-xl space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-purple-400 uppercase mb-1.5">Account Name (e.g. Cash A/c)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Debit/Credit Account Title"
                          value={journalForm.accountName}
                          onChange={(e) => setJournalForm(prev => ({ ...prev, accountName: e.target.value }))}
                          className="flex-1 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                        />
                        <select
                          value={journalForm.nature}
                          onChange={(e) => setJournalForm(prev => ({ ...prev, nature: e.target.value as 'Dr' | 'Cr' }))}
                          className="bg-slate-900 border border-slate-800 rounded-xl px-3 text-xs text-purple-400 font-bold"
                        >
                          <option value="Dr">Debit (Dr)</option>
                          <option value="Cr">Credit (Cr)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1.5">
                        Counter Account (Opposite leg of transaction)
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Sales A/c or Bank A/c"
                        value={journalForm.counterAccount}
                        onChange={(e) => setJournalForm(prev => ({ ...prev, counterAccount: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1.5">Narration block</label>
                    <textarea
                      placeholder="Being details of cash purchases..."
                      rows={2}
                      value={journalForm.narration}
                      onChange={(e) => setJournalForm(prev => ({ ...prev, narration: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={isSavingJournal}
                      className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 rounded-xl text-xs font-bold text-white transition-all cursor-pointer shadow-md"
                    >
                      {isSavingJournal ? 'Saving Entry...' : journalForm.id ? 'Save Changes' : 'Post Transaction'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setJournalForm({
                          id: '',
                          date: new Date().toISOString().substring(0, 10),
                          accountName: '',
                          amount: '',
                          nature: 'Dr',
                          counterAccount: '',
                          narration: ''
                        });
                        setJournalTab('list');
                      }}
                      className="px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold hover:bg-slate-850 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Sub-tab 3: File Upload Batch Block */}
            {journalTab === 'file-upload' && (
              <div className="glass rounded-2xl p-6 border border-slate-800 shadow-xl max-w-xl mx-auto w-full space-y-6">
                <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                  <UploadCloud className="w-4 h-4" />
                  <span>C. File Batch Uploader (/transactions bucket)</span>
                </h3>
                <p className="text-xs text-slate-450 leading-relaxed">
                  Upload a batch text file (`.txt`) containing unstructured transaction statements (one statement per line). The file is uploaded directly to your InsForge cloud storage, retrieved for parsing, and staged below.
                </p>

                <div className="border border-dashed border-slate-800 hover:border-purple-500/40 rounded-xl p-6 flex flex-col items-center justify-center gap-3 text-center transition-all bg-slate-900/10 relative cursor-pointer">
                  <UploadCloud className="w-8 h-8 text-purple-400 animate-pulse" />
                  <span className="text-xs text-slate-300 font-bold">
                    {uploadedFileName ? `Staged: ${uploadedFileName}` : 'Select unstructured transactions file (.txt)'}
                  </span>
                  <input
                    type="file"
                    accept=".txt"
                    onChange={handleBatchFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>

                {isUploadingFile && (
                  <div className="flex items-center justify-center gap-2 text-xs text-purple-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Uploading to bucket and analyzing batch...</span>
                  </div>
                )}

                {stagedEntries.length > 0 && (
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Staged Transactions ({stagedEntries.length})</span>
                      <button
                        onClick={handleSaveStaged}
                        disabled={isSavingJournal}
                        className="px-3 py-1 bg-purple-650 hover:bg-purple-550 rounded-lg text-[10px] font-bold text-white transition-all cursor-pointer"
                      >
                        Approve & Journalize Batch
                      </button>
                    </div>

                    <div className="max-h-48 overflow-y-auto pr-1 space-y-2 border border-slate-850 p-2.5 rounded-xl bg-slate-950/50">
                      {stagedEntries.map((stg, i) => (
                        <div key={i} className="text-[10px] bg-slate-900/40 border border-slate-800 p-2 rounded-lg flex items-center justify-between">
                          <div>
                            <div className="text-white font-bold">{stg.debitAccount} <span className="text-purple-400">Dr.</span> to {stg.creditAccount}</div>
                            <div className="text-slate-500 text-[9px] mt-0.5">{stg.narration}</div>
                          </div>
                          <span className="font-mono text-purple-400 font-bold">{formatCurrency(stg.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sub-tab 4: The 5-Column Ledger Table (Standard particulars) */}
            {journalTab === 'list' && (
              <div className="glass rounded-2xl p-5 border border-slate-800 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Journal Entries</div>
                  {journalEntries.length === 0 && (
                    <button
                      onClick={handleSeedJournal}
                      disabled={isSavingJournal}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-xs font-bold rounded-lg transition-all cursor-pointer"
                    >
                      Seed Demo Ledger
                    </button>
                  )}
                </div>

                {isLoadingJournal ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-450">
                    <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
                    <span className="text-xs">Loading ledger transaction records...</span>
                  </div>
                ) : journalEntries.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-850 rounded-2xl text-slate-500 text-xs">
                    No transactions recorded yet. Use manual or AI form entry to post journal items.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs select-none">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                          <th className="py-3 px-4 w-28 text-center border-r border-slate-800">Date</th>
                          <th className="py-3 px-4 border-r border-slate-800">Particulars</th>
                          <th className="py-3 px-4 w-16 text-center border-r border-slate-800">LF</th>
                          <th className="py-3 px-4 w-32 text-right border-r border-slate-800">Debit Rs (Dr)</th>
                          <th className="py-3 px-4 w-32 text-right border-r border-slate-800">Credit Rs (Cr)</th>
                          <th className="py-3 px-4 w-20 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {journalEntries.map((entry) => (
                          <tr
                            key={entry.id}
                            className="border-b border-slate-850/60 hover:bg-slate-900/35 transition-all"
                          >
                            <td className="py-4 px-2 border-r border-slate-800/80">{renderVerticalDate(entry.date)}</td>
                            <td className="py-4 px-4 space-y-1 border-r border-slate-800/80">
                              <div className="font-bold text-slate-100 flex items-center gap-2">
                                <span>{entry.debit_account}</span>
                                <span className="text-[9px] text-purple-400 font-bold border border-purple-500/20 bg-purple-500/5 px-1.5 py-0.2 rounded uppercase tracking-wider">Dr</span>
                              </div>
                              <div className="text-slate-400 pl-6 font-semibold">
                                To, {entry.credit_account}
                              </div>
                              <div className="text-slate-505 font-semibold italic text-[10px] pl-6 pt-0.5">
                                [ {entry.narration} ]
                              </div>
                            </td>
                            <td className="py-4 px-4 text-center font-mono text-slate-500 border-r border-slate-800/80 font-semibold">J-1</td>
                            <td className="py-4 px-4 text-right font-mono text-white font-bold border-r border-slate-800/80">{formatCurrency(entry.amount)}</td>
                            <td className="py-4 px-4 text-right font-mono text-white font-bold border-r border-slate-800/80">{formatCurrency(entry.amount)}</td>
                            <td className="py-4 px-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleEditJournal(entry)}
                                  className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                                  title="Edit entry"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => handleDeleteJournal(entry.id, e)}
                                  className="p-1 rounded bg-rose-950/20 border border-rose-900/20 text-slate-500 hover:text-rose-400"
                                  title="Delete entry"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* ========================================================================= */}
        {/* PAGE 2: LEDGER Accounts Creation */}
        {activePage === 'ledgers' && (
          <div className="space-y-6">
            
            <div className="glass rounded-2xl p-5 border border-slate-800/80">
              <h2 className="text-lg font-bold text-white m-0">T-Shape General Ledger Accounts</h2>
              <p className="text-xs text-slate-400 mt-1">
                Edge function parses saved double-entries to post transactions to distinct account ledgers.
              </p>
            </div>

            {isLoadingLedger ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
                <span className="text-sm text-slate-400">Edge function mapping account books...</span>
              </div>
            ) : Object.keys(ledgerAccounts).length === 0 ? (
              <div className="glass rounded-2xl p-12 text-center text-slate-400 border border-slate-800">
                <Layers className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <p className="text-sm">No ledger accounts parsed. Enter journal transactions to start ledger books.</p>
                <button
                  onClick={() => setActivePage('journal')}
                  className="mt-4 px-4 py-2 bg-purple-650 hover:bg-purple-550 rounded-xl text-xs font-bold text-white cursor-pointer"
                >
                  Go to Journal
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {Object.entries(ledgerAccounts).map(([accountName, book]) => {
                  const drTotal = book.debits.reduce((sum, item) => sum + item.amount, 0);
                  const crTotal = book.credits.reduce((sum, item) => sum + item.amount, 0);
                  
                  return (
                    <div key={accountName} className="glass rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col justify-between">
                      {/* Ledger Account Title Banner */}
                      <div className="bg-slate-900/50 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
                        <span className="text-sm font-bold text-purple-400 uppercase tracking-wider">{accountName} Book</span>
                        <span className="text-[10px] text-slate-500 font-mono">Folio: L-{accountName.charCodeAt(0)}</span>
                      </div>

                      {/* T-Shape split container */}
                      <div className="grid grid-cols-2 border-b border-slate-850/80">
                        {/* Debit Side (Left) */}
                        <div className="border-r border-slate-850/80 flex flex-col justify-between">
                          {/* Debit table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-[10px] select-none">
                              <thead>
                                <tr className="bg-purple-950/20 text-purple-405 font-bold border-b border-slate-800 uppercase">
                                  <th className="py-2 px-2.5 border-r border-slate-800 w-16">Date</th>
                                  <th className="py-2 px-2.5 border-r border-slate-800">Particular</th>
                                  <th className="py-2 px-2.5 border-r border-slate-800 w-8 text-center">JF</th>
                                  <th className="py-2 px-2.5 text-right w-20">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {book.debits.map((dr) => (
                                  <tr key={dr.id} className="border-b border-slate-900/50 hover:bg-slate-900/10">
                                    <td className="py-2 px-2.5 border-r border-slate-800 text-slate-450 font-semibold">
                                      {new Date(dr.date).toLocaleDateString('en-IN', {month: 'short', day: 'numeric'})}
                                    </td>
                                    <td className="py-2 px-2.5 border-r border-slate-800 font-bold text-slate-205">
                                      {dr.particular}
                                    </td>
                                    <td className="py-2 px-2.5 border-r border-slate-800 text-center font-mono text-slate-500 font-semibold">
                                      {dr.jf || 'J-1'}
                                    </td>
                                    <td className="py-2 px-2.5 text-right font-mono font-bold text-white">
                                      {formatCurrency(dr.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Credit Side (Right) */}
                        <div className="flex flex-col justify-between">
                          {/* Credit table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-[10px] select-none">
                              <thead>
                                <tr className="bg-indigo-950/20 text-indigo-405 font-bold border-b border-slate-800 uppercase">
                                  <th className="py-2 px-2.5 border-r border-slate-800 w-16">Date</th>
                                  <th className="py-2 px-2.5 border-r border-slate-800">Particular</th>
                                  <th className="py-2 px-2.5 border-r border-slate-800 w-8 text-center">JF</th>
                                  <th className="py-2 px-2.5 text-right w-20">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {book.credits.map((cr) => (
                                  <tr key={cr.id} className="border-b border-slate-900/50 hover:bg-slate-900/10">
                                    <td className="py-2 px-2.5 border-r border-slate-800 text-slate-450 font-semibold">
                                      {new Date(cr.date).toLocaleDateString('en-IN', {month: 'short', day: 'numeric'})}
                                    </td>
                                    <td className="py-2 px-2.5 border-r border-slate-800 font-bold text-slate-205">
                                      {cr.particular}
                                    </td>
                                    <td className="py-2 px-2.5 border-r border-slate-800 text-center font-mono text-slate-500 font-semibold">
                                      {cr.jf || 'J-1'}
                                    </td>
                                    <td className="py-2 px-2.5 text-right font-mono font-bold text-white">
                                      {formatCurrency(cr.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      {/* Totals Summary */}
                      <div className="grid grid-cols-2 bg-slate-950/30 text-[10px] font-bold text-slate-300">
                        <div className="border-r border-slate-800 p-2 px-4 flex items-center justify-between">
                          <span>Total Dr:</span>
                          <span className="font-mono text-purple-400">{formatCurrency(drTotal)}</span>
                        </div>
                        <div className="p-2 px-4 flex items-center justify-between">
                          <span>Total Cr:</span>
                          <span className="font-mono text-indigo-400">{formatCurrency(crTotal)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

        {/* ========================================================================= */}
        {/* PAGE 3: TRIAL BALANCE Creation */}
        {activePage === 'trialBalance' && (
          <div className="space-y-6">
            
            <div className="glass rounded-2xl p-5 border border-slate-800/80">
              <h2 className="text-lg font-bold text-white m-0">Trial Balance Worksheet</h2>
              <p className="text-xs text-slate-400 mt-1">
                Edge function aggregates net ledger account debit and credit balances for general audit verification.
              </p>
            </div>

            {isLoadingTrialBalance ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
                <span className="text-sm text-slate-400">Edge function compiling Trial Balance...</span>
              </div>
            ) : trialBalanceList.length === 0 ? (
              <div className="glass rounded-2xl p-12 text-center text-slate-400 border border-slate-800">
                <Database className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <p className="text-sm">Trial balance spreadsheet empty. Setup journal entries to run trial balances.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="glass rounded-2xl p-5 border border-slate-800 shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs select-none">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                          <th className="py-3 px-4 w-20 text-center border-r border-slate-800">Sl No.</th>
                          <th className="py-3 px-4 border-r border-slate-800">Particulars</th>
                          <th className="py-3 px-4 w-24 text-center border-r border-slate-800">LF</th>
                          <th className="py-3 px-4 w-40 text-right border-r border-slate-800">Debit Balance Rs</th>
                          <th className="py-3 px-4 w-40 text-right">Credit Balance Rs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trialBalanceList.map((item) => (
                          <tr key={item.slNo} className="border-b border-slate-850/60 hover:bg-slate-900/35 transition-all">
                            <td className="py-3.5 px-4 text-center text-slate-500 font-mono border-r border-slate-800/80 font-semibold">{item.slNo}</td>
                            <td className="py-3.5 px-4 font-bold text-slate-205 border-r border-slate-800/80">{item.accountName}</td>
                            <td className="py-3.5 px-4 text-center text-slate-500 font-mono border-r border-slate-800/80 font-semibold">{item.lf}</td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-white border-r border-slate-800/80">
                              {item.debitBalance > 0 ? formatCurrency(item.debitBalance) : '-'}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                              {item.creditBalance > 0 ? formatCurrency(item.creditBalance) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-900/20 text-slate-200 font-bold border-t-2 border-slate-800">
                          <td colSpan={3} className="py-4 px-4 text-right uppercase tracking-wider text-[10px] text-purple-400 border-r border-slate-800/80">Total Audit Summary</td>
                          <td className="py-4 px-4 text-right font-mono text-sm text-purple-400 font-black border-r border-slate-800/80">
                            {formatCurrency(trialBalanceList.reduce((sum, item) => sum + item.debitBalance, 0))}
                          </td>
                          <td className="py-4 px-4 text-right font-mono text-sm text-purple-400 font-black">
                            {formatCurrency(trialBalanceList.reduce((sum, item) => sum + item.creditBalance, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Audit matching totals check banner */}
                {(() => {
                  const totalDr = trialBalanceList.reduce((sum, item) => sum + item.debitBalance, 0);
                  const totalCr = trialBalanceList.reduce((sum, item) => sum + item.creditBalance, 0);
                  const isBalanced = Math.round(totalDr) === Math.round(totalCr);

                  return (
                    <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                      isBalanced ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-450'
                    }`}>
                      <div className="flex items-center gap-3">
                        {isBalanced ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        <div className="text-xs font-semibold">
                          {isBalanced 
                            ? `Audit Verification Completed: Total Debits (₹${totalDr.toLocaleString('en-IN')}) successfully MATCHED Total Credits (₹${totalCr.toLocaleString('en-IN')}).`
                            : `Audit Alert Mismatch: Total Debits (₹${totalDr.toLocaleString('en-IN')}) do NOT match Total Credits (₹${totalCr.toLocaleString('en-IN')}). Mismatch value: ₹${Math.abs(totalDr - totalCr).toLocaleString('en-IN')}.`
                          }
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border border-current">
                        {isBalanced ? 'Balanced' : 'Out of Balance'}
                      </span>
                    </div>
                  );
                })()}

              </div>
            )}

          </div>
        )}

        {/* ========================================================================= */}
        {/* PAGE 4: FINANCIAL STATEMENTS Creation */}
        {activePage === 'statements' && (
          <div className="space-y-6">
            
            {/* Header controls block */}
            <div className="glass rounded-2xl p-5 border border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white m-0">Dynamic Financial Statements</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Edge function compiles Profit & Loss reports and Balance Sheets with real-time variables updates.
                </p>
              </div>
              
              <button
                onClick={() => setIsPanelOpen(true)}
                className="px-4 py-2 bg-gradient-to-tr from-purple-600 to-indigo-650 hover:from-purple-500 hover:to-indigo-500 rounded-xl text-xs font-bold text-white transition-all cursor-pointer flex items-center gap-1.5 self-start md:self-auto"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Adjust Closing Variables</span>
              </button>
            </div>

            {isLoadingStatements ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
                <span className="text-sm text-slate-400">Edge function compiling Financial Statements...</span>
              </div>
            ) : !statementData ? (
              <div className="glass rounded-2xl p-12 text-center text-slate-400 border border-slate-800">
                <FileCode className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <p className="text-sm">Statements database empty. Seeding some journal transactions above will generate metrics here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                
                {/* 1. Income Statement (Trading / Profit & Loss) */}
                <div className="glass rounded-2xl p-5 border border-slate-800 shadow-xl space-y-4">
                  <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider border-b border-slate-850 pb-2">Trading & Profit & Loss Statement</h3>
                  
                  <div className="space-y-4 text-xs">
                    {/* Revenues section */}
                    <div className="space-y-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Revenue / Incomes</div>
                      {statementData.incomeStatement.revenues.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between border-b border-slate-900 pb-1.5 pl-2 font-semibold">
                          <span className="text-slate-300">{item.name}</span>
                          <span className="font-mono text-white">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold text-emerald-400 pt-1 pl-2">
                        <span>Total Revenue (A):</span>
                        <span className="font-mono">{formatCurrency(statementData.incomeStatement.totalRevenues)}</span>
                      </div>
                    </div>

                    {/* Expenses section */}
                    <div className="space-y-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Operating Expenses</div>
                      {statementData.incomeStatement.expenses.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between border-b border-slate-900 pb-1.5 pl-2 font-semibold">
                          <span className="text-slate-300">{item.name}</span>
                          <span className="font-mono text-white">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold text-indigo-400 pt-1 pl-2">
                        <span>Total Operating Expenses (B):</span>
                        <span className="font-mono">{formatCurrency(statementData.incomeStatement.totalExpenses)}</span>
                      </div>
                    </div>

                    {/* Net profit highlight */}
                    <div className="bg-purple-950/20 border border-purple-500/20 rounded-xl p-3.5 flex items-center justify-between">
                      <span className="font-bold text-purple-400 text-sm uppercase">Net Operating Profit (A - B):</span>
                      <span className="font-mono text-lg font-black text-white">{formatCurrency(statementData.incomeStatement.netProfit)}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Balance Sheet (Liabilities & Equity vs Assets) */}
                <div className="glass rounded-2xl p-5 border border-slate-800 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                    <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider">Audited Balance Sheet</h3>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${
                      statementData.balanceSheet.isBalanced ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {statementData.balanceSheet.isBalanced ? 'Balanced' : 'Unbalanced'}
                    </span>
                  </div>

                  <div className="space-y-4 text-xs">
                    {/* Fixed & Current Assets */}
                    <div className="space-y-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Asset Allocations</div>
                      {statementData.balanceSheet.assets.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between border-b border-slate-900 pb-1.5 pl-2 font-semibold">
                          <span className="text-slate-300">{item.name}</span>
                          <span className={`font-mono ${item.amount < 0 ? 'text-rose-400' : 'text-white'}`}>
                            {item.amount < 0 ? `(${formatCurrency(Math.abs(item.amount))})` : formatCurrency(item.amount)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold text-emerald-400 pt-1 pl-2">
                        <span>Total Assets:</span>
                        <span className="font-mono">{formatCurrency(statementData.balanceSheet.totalAssets)}</span>
                      </div>
                    </div>

                    {/* Capital & Liabilities */}
                    <div className="space-y-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Equity & Liability Allocations</div>
                      {statementData.balanceSheet.liabilitiesAndEquity.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between border-b border-slate-900 pb-1.5 pl-2 font-semibold">
                          <span className="text-slate-300">{item.name}</span>
                          <span className="font-mono text-white">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold text-indigo-400 pt-1 pl-2">
                        <span>Total Liabilities & Equity:</span>
                        <span className="font-mono">{formatCurrency(statementData.balanceSheet.totalLiabilitiesAndEquity)}</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* Adjusting variables Sliding panel Overlay drawer */}
            {isPanelOpen && (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex justify-end">
                <div className="w-full max-w-sm bg-slate-900 border-l border-slate-800 p-6 flex flex-col justify-between animate-in slide-in-from-right duration-350">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                      <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Closing Adjustments Panel</h3>
                      <button
                        onClick={() => setIsPanelOpen(false)}
                        className="text-xs text-slate-550 hover:text-white"
                      >
                        Close [x]
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Closing Inventory Balance (₹)</label>
                        <input
                          type="number"
                          placeholder="e.g. 350000"
                          value={adjustments.closingInventory}
                          onChange={(e) => setAdjustments(prev => ({ ...prev, closingInventory: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Credited to Income Statement & added to Assets.</p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Provision for Depreciation (₹)</label>
                        <input
                          type="number"
                          placeholder="e.g. 50000"
                          value={adjustments.depreciation}
                          onChange={(e) => setAdjustments(prev => ({ ...prev, depreciation: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Expensed in Profit & Loss & deducted from Assets.</p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Accrued Operational Expenses (₹)</label>
                        <input
                          type="number"
                          placeholder="e.g. 15000"
                          value={adjustments.accruedExpense}
                          onChange={(e) => setAdjustments(prev => ({ ...prev, accruedExpense: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Expensed in Profit & Loss & added to Liabilities.</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setIsPanelOpen(false);
                      setNotification({ type: 'success', message: 'Downstream statements updated with adjustments!' });
                    }}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-xs font-bold rounded-xl text-white transition-all cursor-pointer shadow-md"
                  >
                    Apply Adjustments
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ========================================================================= */}
        {/* ORIGINAL CALCULATOR (Ratio Workspace) */}
        {activePage === 'ratios' && (
          <div className="flex flex-col lg:flex-row gap-8">
            
            <div className="w-full lg:w-[390px] shrink-0 flex flex-col gap-6">
              
              {history.length === 0 && !isLoadingHistory && (
                <div className="bg-gradient-to-tr from-purple-950/20 to-indigo-950/20 border border-purple-500/20 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 blur-xl pointer-events-none rounded-full"></div>
                  <h4 className="text-sm font-bold text-purple-400 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 shrink-0 animate-pulse" />
                    <span>Get Started Immediately!</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Your database is currently empty. Populate the workspace with high-fidelity sample corporate data instantly to see calculations.
                  </p>
                  <button
                    onClick={handleLoadSample}
                    disabled={isSaving}
                    className="mt-3.5 w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold transition-all border border-purple-500/30 cursor-pointer shadow-md"
                  >
                    Load Sample Template
                  </button>
                </div>
              )}

              <div className="glass rounded-2xl p-5 shadow-lg border border-slate-800/80">
                
                <div className="grid grid-cols-2 bg-slate-900/60 p-1 rounded-xl border border-slate-800/80 mb-5">
                  <button
                    type="button"
                    onClick={() => setFormTab('manual')}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      formTab === 'manual' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Form Input</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormTab('ai-scan')}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      formTab === 'ai-scan' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    <span>AI Scanner</span>
                  </button>
                </div>

                {formTab === 'manual' && (
                  <form onSubmit={handleSaveToCloud} className="space-y-4">
                    
                    <div className="grid grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Company Name</label>
                        <input
                          type="text"
                          name="companyName"
                          value={formInputs.companyName}
                          onChange={handleInputChange}
                          placeholder="e.g. Acme Corp"
                          required
                          className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all placeholder:text-slate-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Fiscal Year</label>
                        <input
                          type="number"
                          name="fiscalYear"
                          value={formInputs.fiscalYear}
                          onChange={handleInputChange}
                          placeholder="2025"
                          required
                          className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all placeholder:text-slate-500"
                        />
                      </div>
                    </div>

                    <div className="border-t border-slate-800/60 my-4"></div>

                    <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                      
                      <div className="bg-slate-900/20 p-3 rounded-xl border border-slate-800 space-y-3">
                        <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Short-term Liquidity Assets</div>
                        <div>
                          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                            <span>Current Assets (CA)</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-500 font-mono text-sm">₹</span>
                            <input
                              type="number"
                              name="currentAssets"
                              value={formInputs.currentAssets}
                              onChange={handleInputChange}
                              placeholder="0"
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                            <span>Current Liabilities (CL)</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-500 font-mono text-sm">₹</span>
                            <input
                              type="number"
                              name="currentLiabilities"
                              value={formInputs.currentLiabilities}
                              onChange={handleInputChange}
                              placeholder="0"
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                            <span>Inventory (Stock)</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-500 font-mono text-sm">₹</span>
                            <input
                              type="number"
                              name="inventory"
                              value={formInputs.inventory}
                              onChange={handleInputChange}
                              placeholder="0"
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                            <span>Cash & Equivalents</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-500 font-mono text-sm">₹</span>
                            <input
                              type="number"
                              name="cashAndEquivalents"
                              value={formInputs.cashAndEquivalents}
                              onChange={handleInputChange}
                              placeholder="0"
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900/20 p-3 rounded-xl border border-slate-800 space-y-3">
                        <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Long-term Solvency Assets</div>
                        <div>
                          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                            <span>Total Debt</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-500 font-mono text-sm">₹</span>
                            <input
                              type="number"
                              name="totalDebt"
                              value={formInputs.totalDebt}
                              onChange={handleInputChange}
                              placeholder="0"
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/55 rounded-xl pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                            <span>Shareholders' Equity</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-500 font-mono text-sm">₹</span>
                            <input
                              type="number"
                              name="shareholdersEquity"
                              value={formInputs.shareholdersEquity}
                              onChange={handleInputChange}
                              placeholder="0"
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                            <span>EBIT</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-500 font-mono text-sm">₹</span>
                            <input
                              type="number"
                              name="ebit"
                              value={formInputs.ebit}
                              onChange={handleInputChange}
                              placeholder="0"
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                            <span>Interest Expense</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-500 font-mono text-sm">₹</span>
                            <input
                              type="number"
                              name="interestExpense"
                              value={formInputs.interestExpense}
                              onChange={handleInputChange}
                              placeholder="0"
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900/20 p-3 rounded-xl border border-slate-800 space-y-3">
                        <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Operations & Turnover</div>
                        <div>
                          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                            <span>Cost of Goods Sold (COGS)</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-500 font-mono text-sm">₹</span>
                            <input
                              type="number"
                              name="costOfGoodsSold"
                              value={formInputs.costOfGoodsSold}
                              onChange={handleInputChange}
                              placeholder="0"
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                            <span>Total Revenue (Sales)</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-500 font-mono text-sm">₹</span>
                            <input
                              type="number"
                              name="revenue"
                              value={formInputs.revenue}
                              onChange={handleInputChange}
                              placeholder="0"
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                            <span>Net Profit</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-500 font-mono text-sm">₹</span>
                            <input
                              type="number"
                              name="netProfit"
                              value={formInputs.netProfit}
                              onChange={handleInputChange}
                              placeholder="0"
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                            <span>Net Fixed Assets</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-500 font-mono text-sm">₹</span>
                            <input
                              type="number"
                              name="fixedAssets"
                              value={formInputs.fixedAssets}
                              onChange={handleInputChange}
                              placeholder="0"
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                            />
                          </div>
                        </div>
                      </div>

                    </div>

                    <div className="pt-4 flex gap-3">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:text-slate-350 font-semibold text-sm transition-all border border-purple-500/20 cursor-pointer shadow-lg shadow-purple-500/10 hover:shadow-purple-500/25"
                      >
                        {isSaving ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>{selectedRecordId ? 'Update Record' : 'Save to Cloud'}</span>
                          </>
                        )}
                      </button>
                      {selectedRecordId && (
                        <button
                          type="button"
                          onClick={handleNewSession}
                          className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-semibold transition-all cursor-pointer text-slate-300"
                          title="Clear Calculator"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </form>
                )}

                {formTab === 'ai-scan' && (
                  <form onSubmit={handleScanStatement} className="space-y-4">
                    <div className="text-xs text-slate-400 mb-2 leading-relaxed">
                      Upload your corporate income statement or balance sheet as a raw text file or paste the contents below, and our AI Scanner will automatically extract relevant parameters.
                    </div>

                    <div className="border border-dashed border-slate-800 hover:border-purple-500/40 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center transition-all bg-slate-900/10 relative cursor-pointer">
                      <FileText className="w-6 h-6 text-purple-400" />
                      <span className="text-[10px] text-slate-400 font-semibold">Select Financial Statement text file (.txt, .csv)</span>
                      <input
                        type="file"
                        accept=".txt,.csv,.json"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Or Paste Raw Statement Text</label>
                      <textarea
                        value={scanText}
                        onChange={(e) => setScanText(e.target.value)}
                        placeholder="Company name: Reliance Industries&#13;Balance Sheet 2025:&#13;Current Assets: 5,40,000&#13;Current Liabilities: 2,70,000..."
                        rows={6}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all font-mono"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isScanning}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-650 hover:from-purple-500 hover:to-indigo-500 disabled:from-purple-800 disabled:to-indigo-800 disabled:text-slate-300 font-semibold text-sm transition-all cursor-pointer shadow-lg shadow-purple-500/10"
                    >
                      {isScanning ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Extracting parameters...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 animate-pulse" />
                          <span>Scan & Parse Financials</span>
                        </>
                      )}
                    </button>
                  </form>
                )}

              </div>
            </div>

            <div className="flex-1 flex flex-col gap-6">
              
              <div className="glass rounded-2xl p-5 border border-slate-800/80 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="absolute top-0 right-0 w-80 h-80 bg-purple-600/5 blur-3xl pointer-events-none rounded-full"></div>
                <div>
                  <h2 className="text-lg font-bold text-white m-0">Ratio Analysis Workspace</h2>
                  <p className="text-xs text-slate-400 mt-1.5 max-w-lg leading-relaxed">
                    Financial indicators automatically evaluated against standard ICAI accounting guidelines.
                  </p>
                </div>
                {selectedRecordId ? (
                  <div className="px-3 py-1 rounded-lg border border-purple-500/20 bg-purple-500/5 text-purple-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 self-start md:self-auto">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                    <span>Editing Cloud Record</span>
                  </div>
                ) : (
                  <div className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/40 text-slate-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 self-start md:self-auto">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                    <span>Scratchpad Mode</span>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5">
                    <Coins className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Liquidity Ratios / Short-term Solvency Ratio</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="glass rounded-xl p-4 border border-slate-800 flex flex-col justify-between min-h-[130px]">
                      <div>
                        <div className="flex items-center justify-between text-[9px] font-bold tracking-wide uppercase">
                          <span className="text-slate-500">Current Ratio</span>
                          <span className={evaluations.currentRatio.status === 'optimal' ? 'text-emerald-400' : evaluations.currentRatio.status === 'warning' ? 'text-amber-400' : 'text-rose-400'}>{evaluations.currentRatio.status}</span>
                        </div>
                        <div className="text-2xl font-black text-white font-mono mt-2">{calculatedRatios.currentRatio.toFixed(2)}<span className="text-xs font-semibold text-slate-400 ml-0.5">:1</span></div>
                      </div>
                      <div className="text-[10px] text-slate-400 border-t border-slate-900 pt-2 flex items-center justify-between">
                        <span>Ideal: {evaluations.currentRatio.ideal}</span>
                        <span className="text-[9px] text-slate-500 font-mono">CA / CL</span>
                      </div>
                    </div>

                    <div className="glass rounded-xl p-4 border border-slate-800 flex flex-col justify-between min-h-[130px]">
                      <div>
                        <div className="flex items-center justify-between text-[9px] font-bold tracking-wide uppercase">
                          <span className="text-slate-500">Quick Ratio</span>
                          <span className={evaluations.quickRatio.status === 'optimal' ? 'text-emerald-400' : evaluations.quickRatio.status === 'warning' ? 'text-amber-400' : 'text-rose-400'}>{evaluations.quickRatio.status}</span>
                        </div>
                        <div className="text-2xl font-black text-white font-mono mt-2">{calculatedRatios.quickRatio.toFixed(2)}<span className="text-xs font-semibold text-slate-400 ml-0.5">:1</span></div>
                      </div>
                      <div className="text-[10px] text-slate-400 border-t border-slate-900 pt-2 flex items-center justify-between">
                        <span>Ideal: {evaluations.quickRatio.ideal}</span>
                        <span className="text-[9px] text-slate-500 font-mono">(CA-Inventory)/CL</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5">
                    <ShieldAlert className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Long-term Solvency Ratios</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="glass rounded-xl p-4 border border-slate-800 flex flex-col justify-between min-h-[130px]">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[9px] font-bold tracking-wide uppercase text-slate-500">Debt Equity Ratio</span>
                          <div className="text-2xl font-black text-white font-mono mt-1.5">{calculatedRatios.debtEquityRatio.toFixed(2)}<span className="text-xs font-semibold text-slate-400 ml-0.5">:1</span></div>
                        </div>
                        <div className={`px-2 py-0.5 text-[9px] font-bold rounded border uppercase tracking-wide ${getStatusClasses(evaluations.debtEquityRatio.status)}`}>
                          {evaluations.debtEquityRatio.status}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 border-t border-slate-900 pt-2 flex items-center justify-between">
                        <span>Ideal: {evaluations.debtEquityRatio.ideal}</span>
                        <span className="text-[9px] text-slate-500 font-mono">Debt / Equity</span>
                      </div>
                    </div>

                    <div className="glass rounded-xl p-4 border border-slate-800 flex flex-col justify-between min-h-[130px]">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[9px] font-bold tracking-wide uppercase text-slate-500">Interest Coverage Ratio</span>
                          <div className="text-2xl font-black text-white font-mono mt-1.5">{calculatedRatios.interestCoverage.toFixed(2)}x</div>
                        </div>
                        <div className={`px-2 py-0.5 text-[9px] font-bold rounded border uppercase tracking-wide ${getStatusClasses(evaluations.interestCoverage.status)}`}>
                          {evaluations.interestCoverage.status}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 border-t border-slate-900 pt-2 flex items-center justify-between">
                        <span>Ideal: {evaluations.interestCoverage.ideal}</span>
                        <span className="text-[9px] text-slate-500 font-mono">EBIT / Interest Expense</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5">
                    <Activity className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Turnover Ratio</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="glass rounded-xl p-4 border border-slate-800 flex flex-col justify-between min-h-[130px]">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[9px] font-bold tracking-wide uppercase text-slate-500">Inventory Turnover Ratio</span>
                          <div className="text-2xl font-black text-white font-mono mt-1.5">{calculatedRatios.inventoryTurnover.toFixed(1)}<span className="text-xs font-semibold text-slate-400 ml-0.5"> turns</span></div>
                        </div>
                        <div className={`px-2 py-0.5 text-[9px] font-bold rounded border uppercase tracking-wide ${getStatusClasses(evaluations.inventoryTurnover.status)}`}>
                          {evaluations.inventoryTurnover.status}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 border-t border-slate-900 pt-2 flex items-center justify-between">
                        <span>Ideal: {evaluations.inventoryTurnover.ideal}</span>
                        <span className="text-[9px] text-slate-500 font-mono">COGS / Inventory</span>
                      </div>
                    </div>

                    <div className="glass rounded-xl p-4 border border-slate-800 flex flex-col justify-between min-h-[130px]">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[9px] font-bold tracking-wide uppercase text-slate-500">Fixed Assets Turnover Ratio</span>
                          <div className="text-2xl font-black text-white font-mono mt-1.5">{calculatedRatios.fixedAssetsTurnover.toFixed(2)}x</div>
                        </div>
                        <div className={`px-2 py-0.5 text-[9px] font-bold rounded border uppercase tracking-wide ${getStatusClasses(evaluations.fixedAssetsTurnover.status)}`}>
                          {evaluations.fixedAssetsTurnover.status}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 border-t border-slate-900 pt-2 flex items-center justify-between">
                        <span>Ideal: {evaluations.fixedAssetsTurnover.ideal}</span>
                        <span className="text-[9px] text-slate-500 font-mono">Revenue / Fixed Assets</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Profitability Ratios</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="glass rounded-xl p-4 border border-slate-800 flex flex-col justify-between min-h-[130px]">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[9px] font-bold tracking-wide uppercase text-slate-500">Net Profit Ratio</span>
                          <div className="text-2xl font-black text-white font-mono mt-1.5">{calculatedRatios.netProfitMargin.toFixed(1)}%</div>
                        </div>
                        <div className={`px-2 py-0.5 text-[9px] font-bold rounded border uppercase tracking-wide ${getStatusClasses(evaluations.netProfitMargin.status)}`}>
                          {evaluations.netProfitMargin.status}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 border-t border-slate-900 pt-2 flex items-center justify-between">
                        <span>Ideal: {evaluations.netProfitMargin.ideal}</span>
                        <span className="text-[9px] text-slate-500 font-mono">(Net Profit/Revenue)*100</span>
                      </div>
                    </div>

                    <div className="glass rounded-xl p-4 border border-slate-800 flex flex-col justify-between min-h-[130px]">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[9px] font-bold tracking-wide uppercase text-slate-500">Return on Investments (ROI)</span>
                          <div className="text-2xl font-black text-white font-mono mt-1.5">{calculatedRatios.returnOnInvestment.toFixed(1)}%</div>
                        </div>
                        <div className={`px-2 py-0.5 text-[9px] font-bold rounded border uppercase tracking-wide ${getStatusClasses(evaluations.returnOnInvestment.status)}`}>
                          {evaluations.returnOnInvestment.status}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 border-t border-slate-900 pt-2 flex items-center justify-between">
                        <span>Ideal: {evaluations.returnOnInvestment.ideal}</span>
                        <span className="text-[9px] text-slate-500 font-mono">EBIT / Capital Employed</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* AI Diagnoses section calling functions */}
              <div className="glass rounded-2xl p-5 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
                    <h3 className="text-sm font-bold text-slate-100">AI Financial Diagnosis & Consulting</h3>
                  </div>
                  {aiReport && (
                    <button
                      onClick={handleGenerateAiReport}
                      disabled={isGeneratingReport}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-400 hover:text-white border border-slate-800 transition-all font-semibold cursor-pointer"
                    >
                      Re-run analysis
                    </button>
                  )}
                </div>

                {!aiReport ? (
                  <div className="bg-slate-950/40 rounded-xl p-5 border border-slate-800 text-center flex flex-col items-center justify-center gap-3">
                    <p className="text-xs text-slate-400 max-w-sm">
                      Get an automated review from our AI Consultant summarizing the strengths, weaknesses, and concrete steps to improve your capital structure.
                    </p>
                    <button
                      onClick={handleGenerateAiReport}
                      disabled={isGeneratingReport}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:text-slate-300 text-xs font-semibold transition-all border border-purple-500/20 cursor-pointer shadow-md"
                    >
                      {isGeneratingReport ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Analyzing data metrics...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Generate AI Diagnosis Report</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="bg-slate-950/40 rounded-xl p-5 border border-slate-800 space-y-3.5 relative">
                    {isGeneratingReport && (
                      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
                        <RefreshCw className="w-6 h-6 animate-spin text-purple-505" />
                      </div>
                    )}
                    <div 
                      className="prose prose-invert prose-xs text-slate-300 max-w-none text-xs"
                      dangerouslySetInnerHTML={{ __html: formatAiReport(aiReport) }}
                    />
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

        {/* 2. HISTORY ARCHIVE PAGE */}
        {activePage === 'history' && (
          <div className="glass rounded-2xl p-6 border border-slate-800 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-bold text-white m-0">Corporate Records Database</h2>
              </div>
              
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search company or year..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500/35 transition-all placeholder:text-slate-500"
                />
              </div>
            </div>

            {isLoadingHistory ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400 text-sm">
                <RefreshCw className="w-7 h-7 animate-spin text-purple-500" />
                <span>Loading corporate record archives...</span>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl">
                <p className="text-sm text-slate-500">No records found matching your selection.</p>
                <button
                  onClick={() => setActivePage('ratios')}
                  className="mt-4 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold transition-all cursor-pointer"
                >
                  Create New Record
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4">Company Name</th>
                      <th className="py-3 px-4">Fiscal Year</th>
                      <th className="py-3 px-4 text-right">Revenue</th>
                      <th className="py-3 px-4 text-right">Net Profit</th>
                      <th className="py-3 px-4 text-right">Current Ratio</th>
                      <th className="py-3 px-4 text-right">Debt to Equity</th>
                      <th className="py-3 px-4 text-right">ROI</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((record) => {
                      const computed = calculateRatios({
                        currentAssets: record.current_assets,
                        currentLiabilities: record.current_liabilities,
                        inventory: record.inventory,
                        cashAndEquivalents: record.cash_and_equivalents,
                        costOfGoodsSold: record.cost_of_goods_sold,
                        revenue: record.revenue,
                        netProfit: record.net_profit,
                        totalAssets: record.total_assets || 0,
                        totalDebt: record.total_debt || 0,
                        shareholdersEquity: record.shareholders_equity || 0,
                        ebit: record.ebit || 0,
                        interestExpense: record.interest_expense || 0,
                        fixedAssets: record.fixed_assets || 0
                      });
                      
                      const cRatioStatus = computed.currentRatio >= 2.0 ? 'text-emerald-400' : computed.currentRatio >= 1.5 ? 'text-amber-400' : 'text-rose-400';
                      const deRatioStatus = computed.debtEquityRatio <= 1.5 ? 'text-emerald-400' : computed.debtEquityRatio <= 2.0 ? 'text-amber-400' : 'text-rose-400';

                      return (
                        <tr
                          key={record.id}
                          onClick={() => loadRecordIntoForm(record)}
                          className={`border-b border-slate-800 hover:bg-slate-900/35 transition-all cursor-pointer ${
                            selectedRecordId === record.id ? 'bg-purple-950/10' : ''
                          }`}
                        >
                          <td className="py-4 px-4 font-bold text-slate-200">{record.company_name}</td>
                          <td className="py-4 px-4 text-slate-400">{record.fiscal_year}</td>
                          <td className="py-4 px-4 text-right font-mono text-slate-300">{formatCurrency(record.revenue)}</td>
                          <td className="py-4 px-4 text-right font-mono text-slate-300">{formatCurrency(record.net_profit)}</td>
                          <td className={`py-4 px-4 text-right font-mono font-bold ${cRatioStatus}`}>{computed.currentRatio.toFixed(2)}</td>
                          <td className={`py-4 px-4 text-right font-mono font-bold ${deRatioStatus}`}>{computed.debtEquityRatio.toFixed(2)}</td>
                          <td className="py-4 px-4 text-right font-mono text-slate-200">{computed.returnOnInvestment.toFixed(1)}%</td>
                          <td className="py-4 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); loadRecordIntoForm(record); setActivePage('ratios'); }}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 font-bold transition-all cursor-pointer"
                              >
                                Load
                              </button>
                              <button
                                onClick={(e) => handleDeleteRecord(record.id, e)}
                                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                                title="Delete Record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 3. ICAI ACCOUNTING GUIDE PAGE */}
        {activePage === 'guide' && (
          <div className="space-y-6">
            
            <div className="glass rounded-2xl p-6 border border-slate-800 shadow-xl">
              <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
                <BookOpen className="w-5 h-5 text-purple-400" />
                <span>ICAI Accounting Ratio Guidelines</span>
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Standard corporate guidelines issued by the Institute of Chartered Accountants of India (ICAI) for financial statement review and liquidity metrics.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="glass rounded-2xl p-5 border border-slate-800/80 space-y-3.5">
                <h3 className="text-base font-bold text-slate-200 border-b border-slate-800 pb-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span>Liquidity & Solvency</span>
                </h3>
                
                <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                  <div>
                    <h5 className="font-semibold text-slate-100 text-sm">Current Ratio (Ideal 2:1)</h5>
                    <p className="mt-1">
                      Assesses the firm's capacity to settle current debts out of current resources.
                    </p>
                  </div>
                  <div>
                    <h5 className="font-semibold text-slate-100 text-sm">Quick Ratio (Ideal 1:1)</h5>
                    <p className="mt-1">
                      Enforces a stricter test of liquidity by removing slow-moving stock inventory which takes time to liquidate.
                    </p>
                  </div>
                  <div>
                    <h5 className="font-semibold text-slate-100 text-sm">Debt to Equity Ratio (Ideal &lt; 2.0)</h5>
                    <p className="mt-1">
                      Indicates the relative proportion of debt and equity used to finance the company's assets. Higher ratios represent higher default risk.
                    </p>
                  </div>
                  <div>
                    <h5 className="font-semibold text-slate-100 text-sm">Interest Coverage (Ideal &gt; 3.0)</h5>
                    <p className="mt-1">
                      Indicates how easily a company can pay interest on its outstanding debt. Ratios below 1.5 represent default danger.
                    </p>
                  </div>
                </div>
              </div>

              <div className="glass rounded-2xl p-5 border border-slate-800/80 space-y-3.5">
                <h3 className="text-base font-bold text-slate-200 border-b border-slate-800 pb-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
                  <span>Activity & Profitability</span>
                </h3>
                
                <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                  <div>
                    <h5 className="font-semibold text-slate-100 text-sm">Inventory Turnover Ratio</h5>
                    <p className="mt-1">
                      Measures the speed with which stock is sold and replenished.
                    </p>
                  </div>
                  <div>
                    <h5 className="font-semibold text-slate-100 text-sm">Fixed Assets Turnover</h5>
                    <p className="mt-1">
                      Evaluates how effectively the firm utilizes property and machinery investments to generate revenue.
                    </p>
                  </div>
                  <div>
                    <h5 className="font-semibold text-slate-100 text-sm">Net Profit Ratio</h5>
                    <p className="mt-1">
                      Represents the ratio of net profit generated from top-line gross revenues.
                    </p>
                  </div>
                  <div>
                    <h5 className="font-semibold text-slate-100 text-sm">Return on Investments (ROI)</h5>
                    <p className="mt-1">
                      Evaluates the financial return earned on the total capital employed in the business, calculated as EBIT divided by capital employed.
                    </p>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* 4. USER PROFILE PAGE */}
        {activePage === 'profile' && (
          <div className="glass rounded-2xl p-6 border border-slate-800 shadow-xl max-w-xl mx-auto space-y-6">
            <div className="flex items-center gap-4 border-b border-slate-800 pb-5">
              <div className="w-12 h-12 bg-gradient-to-tr from-purple-600 to-indigo-650 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-purple-500/20">
                {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <h2 className="text-base font-bold text-white m-0">My Account Profile</h2>
                <p className="text-xs text-slate-400 mt-1">Manage connection credentials and database tables</p>
              </div>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              <div className="flex items-center justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400 font-semibold uppercase">Email Address</span>
                <span className="font-mono text-slate-200 font-bold">{user.email}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400 font-semibold uppercase">Verified Account</span>
                <span className="px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full font-bold uppercase text-[9px]">
                  Yes
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400 font-semibold uppercase">Database Records Count</span>
                <span className="font-mono text-slate-200 font-bold">{history.length} items</span>
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-sm font-semibold text-white transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-slate-500" />
                <span>Log Out of Session</span>
              </button>
            </div>
          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 text-center text-xs text-slate-500 mt-auto">
        <p>&copy; {new Date().getFullYear()} Balansify Calculator. All formulas conform to ICAI requirements. Persisted securely via InsForge.</p>
      </footer>

    </div>
  );
}
