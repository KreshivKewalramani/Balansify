export function sanitizeString(val: string): string {
  if (!val) return '';
  // 1. Escape HTML special characters
  let escaped = val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  // 2. Strip standard HTML tags just in case
  escaped = escaped.replace(/<[^>]*>/g, '');
  return escaped;
}

export function validateRatioInputs(inputs: any): { success: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!inputs.companyName || inputs.companyName.trim().length === 0) {
    errors.push('Company Name is required.');
  }
  
  const year = parseInt(inputs.fiscalYear);
  if (isNaN(year) || year < 1800 || year > 2100) {
    errors.push('Fiscal Year must be a valid year between 1800 and 2100.');
  }

  const numericFields = [
    'currentAssets', 'currentLiabilities', 'inventory', 'cashAndEquivalents',
    'costOfGoodsSold', 'revenue', 'netProfit', 'totalAssets', 'totalDebt',
    'shareholdersEquity', 'ebit', 'interestExpense', 'fixedAssets'
  ];

  numericFields.forEach(field => {
    const val = parseFloat(inputs[field]);
    if (isNaN(val) || val < 0) {
      errors.push(`${field.replace(/([A-Z])/g, ' $1')} must be a non-negative number.`);
    }
  });

  return {
    success: errors.length === 0,
    errors
  };
}

export function validateJournalInputs(inputs: any): { success: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!inputs.accountName || inputs.accountName.trim().length === 0) {
    errors.push('Account Name is required.');
  }

  if (!inputs.counterAccount || inputs.counterAccount.trim().length === 0) {
    errors.push('Counter Account is required.');
  }

  if (inputs.accountName.trim() === inputs.counterAccount.trim()) {
    errors.push('Account and Counter Account cannot be the same.');
  }

  const amount = parseFloat(inputs.amount);
  if (isNaN(amount) || amount <= 0) {
    errors.push('Amount must be a positive number.');
  }

  if (!inputs.date || isNaN(Date.parse(inputs.date))) {
    errors.push('A valid transaction date is required.');
  }

  return {
    success: errors.length === 0,
    errors
  };
}

export function validateAdjustmentInputs(inputs: any): { success: boolean; errors: string[] } {
  const errors: string[] = [];
  const fields = ['closingInventory', 'depreciation', 'accruedExpense'];

  fields.forEach(field => {
    const val = parseFloat(inputs[field]);
    if (isNaN(val) || val < 0) {
      errors.push(`${field.replace(/([A-Z])/g, ' $1')} must be a non-negative number.`);
    }
  });

  return {
    success: errors.length === 0,
    errors
  };
}

export async function computeClientCsrfToken(token: string | null): Promise<string> {
  if (!token) return '';
  const msgUint8 = new TextEncoder().encode(token);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
