export interface FinancialInputs {
  currentAssets: number;
  currentLiabilities: number;
  inventory: number;
  cashAndEquivalents: number;
  costOfGoodsSold: number;
  revenue: number;
  netProfit: number;
  totalAssets: number;
  totalDebt: number;
  shareholdersEquity: number;
  ebit: number;
  interestExpense: number;
  fixedAssets: number;
}

export interface FinancialRatios {
  currentRatio: number;
  quickRatio: number;
  debtEquityRatio: number;
  interestCoverage: number;
  inventoryTurnover: number;
  fixedAssetsTurnover: number;
  netProfitMargin: number;
  returnOnInvestment: number;
}

/**
 * Calculates ICAI compliant financial ratios.
 */
export function calculateRatios(inputs: FinancialInputs): FinancialRatios {
  const {
    currentAssets,
    currentLiabilities,
    inventory,
    costOfGoodsSold,
    revenue,
    netProfit,
    totalDebt,
    shareholdersEquity,
    ebit,
    interestExpense,
    fixedAssets,
  } = inputs;

  // Prevent divide-by-zero errors
  const safeCurrentLiabilities = currentLiabilities === 0 ? 1 : currentLiabilities;
  const safeInventory = inventory === 0 ? 1 : inventory;
  const safeRevenue = revenue === 0 ? 1 : revenue;
  const safeShareholdersEquity = shareholdersEquity === 0 ? 1 : shareholdersEquity;
  const safeInterestExpense = interestExpense === 0 ? 1 : interestExpense;
  const safeFixedAssets = fixedAssets === 0 ? 1 : fixedAssets;
  
  const capitalEmployed = shareholdersEquity + totalDebt;
  const safeCapitalEmployed = capitalEmployed === 0 ? 1 : capitalEmployed;

  // Formula Calculations (ICAI Standards)
  const currentRatio = currentAssets / safeCurrentLiabilities;
  const quickRatio = (currentAssets - inventory) / safeCurrentLiabilities;
  const inventoryTurnover = costOfGoodsSold / safeInventory;
  const netProfitMargin = (netProfit / safeRevenue) * 100;
  
  // Solvency & Turnover additions
  const debtEquityRatio = totalDebt / safeShareholdersEquity;
  const interestCoverage = ebit / safeInterestExpense;
  const fixedAssetsTurnover = revenue / safeFixedAssets;
  const returnOnInvestment = (ebit / safeCapitalEmployed) * 100;

  return {
    currentRatio,
    quickRatio,
    debtEquityRatio,
    interestCoverage,
    inventoryTurnover,
    fixedAssetsTurnover,
    netProfitMargin,
    returnOnInvestment,
  };
}

export interface RatioBenchmark {
  label: string;
  value: number;
  ideal: string;
  status: 'optimal' | 'warning' | 'critical';
  description: string;
}

/**
 * Gets benchmark evaluations.
 */
export function evaluateRatios(ratios: FinancialRatios): Record<keyof FinancialRatios, RatioBenchmark> {
  return {
    currentRatio: {
      label: 'Current Ratio',
      value: ratios.currentRatio,
      ideal: '2.0 : 1',
      status: ratios.currentRatio >= 2.0 ? 'optimal' : ratios.currentRatio >= 1.5 ? 'warning' : 'critical',
      description: ratios.currentRatio >= 2.0 
        ? 'Excellent short-term liquidity profile. Meets the ideal ICAI standard.'
        : ratios.currentRatio >= 1.5
        ? 'Acceptable liquidity, but monitoring current assets is advised.'
        : 'Critical short-term solvency risk. Immediate working capital management required.',
    },
    quickRatio: {
      label: 'Quick / Acid-Test Ratio',
      value: ratios.quickRatio,
      ideal: '1.0 : 1',
      status: ratios.quickRatio >= 1.0 ? 'optimal' : ratios.quickRatio >= 0.8 ? 'warning' : 'critical',
      description: ratios.quickRatio >= 1.0
        ? 'Optimal liquidity excluding slow-moving inventory. Stable buffer.'
        : ratios.quickRatio >= 0.8
        ? 'Caution: High dependency on inventory liquidation for short-term debt repayment.'
        : 'Insolvent liquid asset levels. Quick assets cannot cover short-term debts.',
    },
    debtEquityRatio: {
      label: 'Debt to Equity Ratio',
      value: ratios.debtEquityRatio,
      ideal: '< 2.0 : 1',
      status: ratios.debtEquityRatio <= 1.5 ? 'optimal' : ratios.debtEquityRatio <= 2.0 ? 'warning' : 'critical',
      description: ratios.debtEquityRatio <= 1.5
        ? 'Low leverage risk. Firm is funded primarily by equity partners.'
        : ratios.debtEquityRatio <= 2.0
        ? 'Moderate leverage. Acceptable risk profile, but monitor debt obligations.'
        : 'Highly leveraged capital structure. Increased risk of default during downturns.',
    },
    interestCoverage: {
      label: 'Interest Coverage Ratio',
      value: ratios.interestCoverage,
      ideal: '> 3.0',
      status: ratios.interestCoverage >= 3.0 ? 'optimal' : ratios.interestCoverage >= 1.5 ? 'warning' : 'critical',
      description: ratios.interestCoverage >= 3.0
        ? 'Excellent interest servicing buffer. Earnings cover interest comfortably.'
        : ratios.interestCoverage >= 1.5
        ? 'Tight coverage margin. vulnerable to interest rate hikes or lower margins.'
        : 'Immediate default risk. Earnings are insufficient to service financial debt.',
    },
    inventoryTurnover: {
      label: 'Inventory Turnover Ratio',
      value: ratios.inventoryTurnover,
      ideal: '4.0 - 8.0',
      status: ratios.inventoryTurnover >= 4.0 ? 'optimal' : ratios.inventoryTurnover >= 2.0 ? 'warning' : 'critical',
      description: ratios.inventoryTurnover >= 4.0
        ? 'Healthy stock velocity. Assets are converted to sales efficiently.'
        : ratios.inventoryTurnover >= 2.0
        ? 'Slow turnover. Potential risk of obsolete inventory or overstocking.'
        : 'Very low turnover. Capital is tied up in dead stock.',
    },
    fixedAssetsTurnover: {
      label: 'Fixed Assets Turnover Ratio',
      value: ratios.fixedAssetsTurnover,
      ideal: '> 5.0',
      status: ratios.fixedAssetsTurnover >= 5.0 ? 'optimal' : ratios.fixedAssetsTurnover >= 3.0 ? 'warning' : 'critical',
      description: ratios.fixedAssetsTurnover >= 5.0
        ? 'Efficient utilization of plant, equipment, and fixed investments.'
        : ratios.fixedAssetsTurnover >= 3.0
        ? 'Sub-optimal asset output. Equipment capacity may be underutilized.'
        : 'Very low capacity utilization. Fixed investments generate revenue yield.',
    },
    netProfitMargin: {
      label: 'Net Profit Ratio',
      value: ratios.netProfitMargin,
      ideal: '> 10%',
      status: ratios.netProfitMargin >= 10.0 ? 'optimal' : ratios.netProfitMargin >= 5.0 ? 'warning' : 'critical',
      description: ratios.netProfitMargin >= 10.0
        ? 'Highly profitable operations with strong cost control.'
        : ratios.netProfitMargin >= 5.0
        ? 'Moderate profit margins. Susceptible to market price shocks.'
        : 'Low profitability. Investigate pricing structure and fixed overheads.',
    },
    returnOnInvestment: {
      label: 'Return on Investments (ROI)',
      value: ratios.returnOnInvestment,
      ideal: '> 15%',
      status: ratios.returnOnInvestment >= 15.0 ? 'optimal' : ratios.returnOnInvestment >= 8.0 ? 'warning' : 'critical',
      description: ratios.returnOnInvestment >= 15.0
        ? 'Highly lucrative capital return. Generating returns well above capital costs.'
        : ratios.returnOnInvestment >= 8.0
        ? 'Fair returns. Capital yield is close to baseline financing costs.'
        : 'Inadequate capital yield. Destroys shareholder value relative to capital cost.',
    }
  };
}
