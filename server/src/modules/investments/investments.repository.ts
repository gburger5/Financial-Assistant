/**
 * @module investments.repository
 * @description DynamoDB data-access layer for the Investments module.
 * Contains no business logic — each function performs a single, named
 * database operation. Returns null or [] instead of throwing when records
 * are not found; the service layer decides what to do.
 *
 * InvestmentTransactions table schema:
 *   PK: userId (HASH), SK: dateTransactionId (RANGE) — "date#investment_transaction_id"
 *   GSI: plaidInvestmentTransactionId-index
 *
 * Holdings table schema:
 *   PK: userId (HASH), SK: snapshotDateAccountSecurity (RANGE)
 *                       — "snapshotDate#accountId#securityId"
 *   GSI: plaidAccountId-index
 *
 * Reserved-word note:
 *   "date", "name", "type", and "subtype" are reserved words in DynamoDB's
 *   expression syntax and must be aliased via ExpressionAttributeNames in
 *   every UpdateExpression that references them.
 */
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db } from '../../db/index.js';
import { Indexes, Tables } from '../../db/tables.js';
import type { Holding, InvestmentTransaction } from './investments.types.js';

// ---------------------------------------------------------------------------
// InvestmentTransactions write functions
// ---------------------------------------------------------------------------

/**
 * Upserts an InvestmentTransaction in DynamoDB using UpdateCommand.
 * All mutable fields are overwritten on every call. createdAt is written
 * with `if_not_exists` so the original creation timestamp is never clobbered
 * by subsequent re-fetches of the same date window (Plaid may retroactively
 * correct cost basis and corporate actions, so re-fetching is expected).
 *
 * "name" is a DynamoDB reserved word and must be aliased via
 * ExpressionAttributeNames (#name) in every expression that references it.
 *
 * @param {InvestmentTransaction} tx - The fully-mapped transaction to persist.
 * @returns {Promise<void>}
 */
export async function upsertInvestmentTransaction(tx: InvestmentTransaction): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: Tables.InvestmentTransactions,
      Key: { userId: tx.userId, dateTransactionId: tx.dateTransactionId },
      // "date", "name", "type", and "subtype" are DynamoDB reserved words — alias via ExpressionAttributeNames.
      UpdateExpression:
        'SET investmentTransactionId = :investmentTransactionId, ' +
        'plaidAccountId = :plaidAccountId, ' +
        'securityId = :securityId, ' +
        '#date = :date, ' +
        '#name = :name, ' +
        'quantity = :quantity, ' +
        'amount = :amount, ' +
        'price = :price, ' +
        'fees = :fees, ' +
        '#type = :type, ' +
        '#subtype = :subtype, ' +
        'isoCurrencyCode = :isoCurrencyCode, ' +
        'unofficialCurrencyCode = :unofficialCurrencyCode, ' +
        'updatedAt = :updatedAt, ' +
        'createdAt = if_not_exists(createdAt, :createdAt)',
      ExpressionAttributeNames: {
        '#date': 'date',
        '#name': 'name',
        '#type': 'type',
        '#subtype': 'subtype',
      },
      ExpressionAttributeValues: {
        ':investmentTransactionId': tx.investmentTransactionId,
        ':plaidAccountId': tx.plaidAccountId,
        ':securityId': tx.securityId,
        ':date': tx.date,
        ':name': tx.name,
        ':quantity': tx.quantity,
        ':amount': tx.amount,
        ':price': tx.price,
        ':fees': tx.fees,
        ':type': tx.type,
        ':subtype': tx.subtype,
        ':isoCurrencyCode': tx.isoCurrencyCode,
        ':unofficialCurrencyCode': tx.unofficialCurrencyCode,
        ':updatedAt': tx.updatedAt,
        ':createdAt': tx.createdAt,
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// InvestmentTransactions query functions
// ---------------------------------------------------------------------------

/**
 * Returns all investment transactions for a user on or after sinceDate.
 * Uses BETWEEN on the sort key (dateTransactionId). The upper bound
 * "9999-12-31#~" captures the entire future — ISO dates sort correctly as
 * plain strings, and "~" has a high ASCII value that sorts after any ID suffix.
 *
 * @param {string} userId - UUID of the user whose transactions to fetch.
 * @param {string} sinceDate - YYYY-MM-DD lower bound (inclusive).
 * @returns {Promise<InvestmentTransaction[]>} Matching transactions, or [] if none.
 */
export async function getInvestmentTransactionsSince(
  userId: string,
  sinceDate: string,
): Promise<InvestmentTransaction[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.InvestmentTransactions,
      KeyConditionExpression:
        'userId = :userId AND dateTransactionId BETWEEN :sinceDate AND :endRange',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':sinceDate': sinceDate,
        ':endRange': '9999-12-31#~',
      },
    }),
  );

  return (result.Items ?? []) as InvestmentTransaction[];
}

/**
 * Returns all investment transactions for a user within a date range (inclusive).
 * The upper bound is endDate + "#~" so the full end date is captured — a plain
 * endDate would exclude any transaction whose sort key is "endDate#<id>" because
 * "endDate#" > "endDate" alphabetically.
 *
 * @param {string} userId - UUID of the user whose transactions to fetch.
 * @param {string} startDate - YYYY-MM-DD lower bound (inclusive).
 * @param {string} endDate - YYYY-MM-DD upper bound (inclusive).
 * @returns {Promise<InvestmentTransaction[]>} Matching transactions, or [] if none.
 */
export async function getInvestmentTransactionsInRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<InvestmentTransaction[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.InvestmentTransactions,
      KeyConditionExpression:
        'userId = :userId AND dateTransactionId BETWEEN :startDate AND :endRange',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':startDate': startDate,
        ':endRange': `${endDate}#~`,
      },
    }),
  );

  return (result.Items ?? []) as InvestmentTransaction[];
}

// ---------------------------------------------------------------------------
// Holdings write functions
// ---------------------------------------------------------------------------

/**
 * Upserts a Holding in DynamoDB using UpdateCommand.
 * All mutable fields are overwritten on every sync. createdAt is written
 * with `if_not_exists` to preserve the original creation timestamp across
 * re-syncs of the same snapshot date.
 *
 * @param {Holding} holding - The fully-mapped holding to persist.
 * @returns {Promise<void>}
 */
export async function upsertHolding(holding: Holding): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: Tables.Holdings,
      Key: {
        userId: holding.userId,
        snapshotDateAccountSecurity: holding.snapshotDateAccountSecurity,
      },
      UpdateExpression:
        'SET plaidAccountId = :plaidAccountId, ' +
        'securityId = :securityId, ' +
        'snapshotDate = :snapshotDate, ' +
        'quantity = :quantity, ' +
        'institutionPrice = :institutionPrice, ' +
        'institutionValue = :institutionValue, ' +
        'costBasis = :costBasis, ' +
        'isoCurrencyCode = :isoCurrencyCode, ' +
        'unofficialCurrencyCode = :unofficialCurrencyCode, ' +
        'securityName = :securityName, ' +
        'tickerSymbol = :tickerSymbol, ' +
        'securityType = :securityType, ' +
        'closePrice = :closePrice, ' +
        'closePriceAsOf = :closePriceAsOf, ' +
        'isin = :isin, ' +
        'cusip = :cusip, ' +
        'updatedAt = :updatedAt, ' +
        'createdAt = if_not_exists(createdAt, :createdAt)',
      ExpressionAttributeValues: {
        ':plaidAccountId': holding.plaidAccountId,
        ':securityId': holding.securityId,
        ':snapshotDate': holding.snapshotDate,
        ':quantity': holding.quantity,
        ':institutionPrice': holding.institutionPrice,
        ':institutionValue': holding.institutionValue,
        ':costBasis': holding.costBasis,
        ':isoCurrencyCode': holding.isoCurrencyCode,
        ':unofficialCurrencyCode': holding.unofficialCurrencyCode,
        ':securityName': holding.securityName,
        ':tickerSymbol': holding.tickerSymbol,
        ':securityType': holding.securityType,
        ':closePrice': holding.closePrice,
        ':closePriceAsOf': holding.closePriceAsOf,
        ':isin': holding.isin,
        ':cusip': holding.cusip,
        ':updatedAt': holding.updatedAt,
        ':createdAt': holding.createdAt,
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Holdings query functions
// ---------------------------------------------------------------------------

/**
 * Returns all holdings from the most recent snapshot for a user.
 * Two-step operation:
 *   1. Query with ScanIndexForward: false and Limit: 1 to cheaply get
 *      the latest snapshotDate (one item read, only the date projected).
 *   2. Query all holdings whose sort key falls within that snapshot date.
 *
 * Returns [] if no holdings exist for the user.
 *
 * @param {string} userId - UUID of the user whose latest holdings to fetch.
 * @returns {Promise<Holding[]>} Holdings from the latest snapshot, or [] if none.
 */
export async function getLatestHoldingsByUser(userId: string): Promise<Holding[]> {
  // Step 1: Get the most recent snapshotDate with minimal data transfer.
  const latestResult = await db.send(
    new QueryCommand({
      TableName: Tables.Holdings,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ScanIndexForward: false,
      Limit: 1,
      ProjectionExpression: 'snapshotDate',
    }),
  );

  if (!latestResult.Items || latestResult.Items.length === 0) {
    return [];
  }

  const latestDate = (latestResult.Items[0] as { snapshotDate: string }).snapshotDate;

  // Step 2: Fetch all holdings for that snapshot date.
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Holdings,
      KeyConditionExpression:
        'userId = :userId AND snapshotDateAccountSecurity BETWEEN :startKey AND :endKey',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':startKey': latestDate,
        ':endKey': `${latestDate}#~`,
      },
    }),
  );

  return (result.Items ?? []) as Holding[];
}

/**
 * Returns all holdings for a user on a specific snapshot date.
 * Uses BETWEEN so all account/security combinations on that date are captured
 * regardless of how many there are.
 *
 * @param {string} userId - UUID of the user whose holdings to fetch.
 * @param {string} snapshotDate - YYYY-MM-DD snapshot date to fetch.
 * @returns {Promise<Holding[]>} Holdings for that snapshot, or [] if none.
 */
export async function getHoldingsBySnapshotDate(
  userId: string,
  snapshotDate: string,
): Promise<Holding[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Holdings,
      KeyConditionExpression:
        'userId = :userId AND snapshotDateAccountSecurity BETWEEN :startKey AND :endKey',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':startKey': snapshotDate,
        ':endKey': `${snapshotDate}#~`,
      },
    }),
  );

  return (result.Items ?? []) as Holding[];
}

/**
 * Returns all holdings for a user from sinceDate forward across all snapshots.
 * Useful for fetching portfolio history starting from a given date.
 *
 * @param {string} userId - UUID of the user whose holdings to fetch.
 * @param {string} sinceDate - YYYY-MM-DD lower bound (inclusive).
 * @returns {Promise<Holding[]>} Matching holdings across all snapshots, or [] if none.
 */
export async function getHoldingsSince(userId: string, sinceDate: string): Promise<Holding[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Holdings,
      KeyConditionExpression:
        'userId = :userId AND snapshotDateAccountSecurity BETWEEN :sinceDate AND :endRange',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':sinceDate': sinceDate,
        ':endRange': '9999-12-31#~',
      },
    }),
  );

  return (result.Items ?? []) as Holding[];
}

/**
 * Returns all holdings for a user across every snapshot date.
 * Used for portfolio-value-over-time charts where the full history is needed.
 *
 * @param {string} userId - UUID of the user whose holdings to fetch.
 * @returns {Promise<Holding[]>} All holdings for the user, or [] if none.
 */
export async function getAllHoldingsByUser(userId: string): Promise<Holding[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Holdings,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    }),
  );

  return (result.Items ?? []) as Holding[];
}

/**
 * Returns all holdings for a given Plaid account ID across all snapshot dates.
 * Uses the plaidAccountId-index GSI — the base table PK is userId, so
 * looking up by account ID requires the GSI.
 *
 * @param {string} plaidAccountId - Plaid account ID to look up.
 * @returns {Promise<Holding[]>} All holdings for that account, or [] if none.
 */
export async function getHoldingsByAccountId(plaidAccountId: string): Promise<Holding[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Holdings,
      IndexName: Indexes.Holdings.plaidAccountIdIndex,
      KeyConditionExpression: 'plaidAccountId = :plaidAccountId',
      ExpressionAttributeValues: { ':plaidAccountId': plaidAccountId },
    }),
  );

  return (result.Items ?? []) as Holding[];
}
