export const Tables = {
  Users: "Users",
  Budgets: "Budgets",
  PlaidItems: "PlaidItems",
  Accounts: "Accounts",
  Transactions: "Transactions",
  InvestmentTransactions: "InvestmentTransactions",
  Holdings: "Holdings",
  Liabilities: "Liabilities",
  AuthTokens: "AuthTokens",
} as const;

export const Indexes = {
  Users: {
    emailIndex: "email-index",
    emailVerificationTokenIndex: "EmailVerificationTokenIndex",
    passwordResetTokenIndex: "passwordResetToken-index",
  },
  PlaidItems: {
    itemIdIndex: "itemId-index",
  },
  Accounts: {
    itemIdIndex: "itemId-index",
    plaidAccountIdIndex: "plaidAccountId-index",
  },
  Transactions: {
    plaidTransactionIdIndex: "plaidTransactionId-index",
    accountIdDateIndex: "accountId-date-index",
  },
  InvestmentTransactions: {
    plaidInvestmentTransactionIdIndex: "plaidInvestmentTransactionId-index",
  },
  Holdings: {
    plaidAccountIdIndex: "plaidAccountId-index",
  },
  AuthTokens: {
    userIdIndex: "userId-index",
  },
} as const;