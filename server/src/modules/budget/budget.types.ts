/**
 * The four supported financial goals a user can select.
 * Stored as an array on the Budget so users can prioritize multiple goals.
 */
export type BudgetGoal =
  | 'pay down debt'
  | 'maximize investments'
  | 'save for goals'
  | 'build up emergency fund';

/** All valid BudgetGoal values, used for runtime validation. */
export const BUDGET_GOALS: BudgetGoal[] = [
  'pay down debt',
  'maximize investments',
  'save for goals',
  'build up emergency fund',
];

export interface Budget {
  userId: string;
  budgetId: string;       // ULID — latest budget = highest ULID
  createdAt: string;      // ISO timestamp
  income: BudgetAmount;
  housing: BudgetAmount;
  utilities: BudgetAmount;
  transportation: BudgetAmount;
  groceries: BudgetAmount;
  takeout: BudgetAmount;
  shopping: BudgetAmount;
  personalCare: BudgetAmount;
  savings: BudgetAmount;
  entertainment: BudgetAmount;
  medical: BudgetAmount;
  debts: BudgetAmount;
  investments: BudgetAmount;
  goals: BudgetGoal[];
}

export interface BudgetAmount {
  amount: number;
}

export type BudgetUpdateInput = Partial<{
  income: BudgetAmount;
  housing: BudgetAmount;
  utilities: BudgetAmount;
  transportation: BudgetAmount;
  groceries: BudgetAmount;
  shopping: BudgetAmount;
  takeout: BudgetAmount;
  personalCare: BudgetAmount;
  savings: BudgetAmount;
  entertainment: BudgetAmount;
  medical: BudgetAmount;
  debts: BudgetAmount;
  investments: BudgetAmount;
  goals: BudgetGoal[];
}>;

/**
 * Maps Plaid detailedCategory strings to budget field paths.
 * Each key is a Plaid detailed category; the value is an array of
 * dot-separated paths into the Budget object where that amount should
 * be accumulated (e.g. 'groceries.amount').
 *
 * Debt-related categories (LOAN_PAYMENTS_*) are intentionally absent —
 * debts are sourced from liabilities (minimum payments), not transactions.
 */
export const CATEGORY_MAP: Record<string, string[]> = {
  // Income
  'INCOME_SALARY': ['income.amount'],
  'INCOME_GIG_ECONOMY': ['income.amount'],
  'INCOME_OTHER': ['income.amount'],
  'INCOME_MILITARY': ['income.amount'],
  'INCOME_RENTAL': ['income.amount'],
  'INCOME_LONG_TERM_DISABILITY': ['income.amount'],
  'INCOME_UNEMPLOYMENT': ['income.amount'],
  'INCOME_INTEREST_EARNED': ['income.amount'],
  'INCOME_DIVIDENDS': ['income.amount'],

  // Housing
  'RENT_AND_UTILITIES_RENT': ['housing.amount'],

  // Utilities
  'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY': ['utilities.amount'],
  'RENT_AND_UTILITIES_INTERNET_AND_CABLE': ['utilities.amount'],
  'RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT': ['utilities.amount'],
  'RENT_AND_UTILITIES_TELEPHONE': ['utilities.amount'],
  'RENT_AND_UTILITIES_WATER': ['utilities.amount'],
  'RENT_AND_UTILITIES_OTHER_UTILITIES': ['utilities.amount'],

  // Transportation
  'TRANSPORTATION_BIKES_AND_SCOOTERS': ['transportation.amount'],
  'TRANSPORTATION_GAS': ['transportation.amount'],
  'TRANSPORTATION_PARKING': ['transportation.amount'],
  'TRANSPORTATION_PUBLIC_TRANSIT': ['transportation.amount'],
  'TRANSPORTATION_TAXIS_AND_RIDE_SHARES': ['transportation.amount'],
  'TRANSPORTATION_TOLLS': ['transportation.amount'],
  'TRANSPORTATION_OTHER_TRANSPORTATION': ['transportation.amount'],

  // Groceries
  'FOOD_AND_DRINK_GROCERIES': ['groceries.amount'],

  // Takeout
  'FOOD_AND_DRINK_RESTAURANT': ['takeout.amount'],
  'FOOD_AND_DRINK_FAST_FOOD': ['takeout.amount'],
  'FOOD_AND_DRINK_COFFEE': ['takeout.amount'],
  'FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR': ['takeout.amount'],

  // Shopping
  'GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS': ['shopping.amount'],
  'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES': ['shopping.amount'],
  'GENERAL_MERCHANDISE_CONVENIENCE_STORES': ['shopping.amount'],
  'GENERAL_MERCHANDISE_DEPARTMENT_STORES': ['shopping.amount'],
  'GENERAL_MERCHANDISE_DISCOUNT_STORES': ['shopping.amount'],
  'GENERAL_MERCHANDISE_ELECTRONICS': ['shopping.amount'],
  'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES': ['shopping.amount'],
  'GENERAL_MERCHANDISE_OFFICE_SUPPLIES': ['shopping.amount'],
  'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES': ['shopping.amount'],
  'GENERAL_MERCHANDISE_PET_SUPPLIES': ['shopping.amount'],
  'GENERAL_MERCHANDISE_SPORTING_GOODS': ['shopping.amount'],
  'GENERAL_MERCHANDISE_SUPERSTORES': ['shopping.amount'],
  'GENERAL_MERCHANDISE_TOBACCO_AND_VAPE': ['shopping.amount'],
  'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE': ['shopping.amount'],

  // Personal Care
  'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS': ['personalCare.amount'],
  'PERSONAL_CARE_HAIR_AND_BEAUTY': ['personalCare.amount'],
  'PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING': ['personalCare.amount'],
  'PERSONAL_CARE_OTHER_PERSONAL_CARE': ['personalCare.amount'],

  // Savings (internal transfers to savings accounts)
  'TRANSFER_OUT_ACCOUNT_TRANSFER': ['savings.amount'],

  // Entertainment
  'ENTERTAINMENT_CASINOS_AND_GAMBLING': ['entertainment.amount'],
  'ENTERTAINMENT_MUSIC_AND_AUDIO': ['entertainment.amount'],
  'ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS': ['entertainment.amount'],
  'ENTERTAINMENT_TV_AND_MOVIES': ['entertainment.amount'],
  'ENTERTAINMENT_VIDEO_GAMES': ['entertainment.amount'],
  'ENTERTAINMENT_OTHER_ENTERTAINMENT': ['entertainment.amount'],

  // Medical
  'MEDICAL_DENTAL_CARE': ['medical.amount'],
  'MEDICAL_EYE_CARE': ['medical.amount'],
  'MEDICAL_HOSPITAL_AND_NURSING_CARE': ['medical.amount'],
  'MEDICAL_PHARMACIES_AND_SUPPLEMENTS': ['medical.amount'],
  'MEDICAL_PRIMARY_CARE': ['medical.amount'],
  'MEDICAL_VETERINARY_SERVICES': ['medical.amount'],
  'MEDICAL_OTHER_MEDICAL': ['medical.amount'],
};

/**
 * Set of Plaid detailed categories that represent income.
 * Income amounts arrive as negative in Plaid's convention (money in),
 * so the sign is flipped before accumulation.
 */
export const INCOME_CATEGORIES = new Set([
  'INCOME_SALARY', 'INCOME_GIG_ECONOMY', 'INCOME_OTHER',
  'INCOME_MILITARY', 'INCOME_RENTAL', 'INCOME_LONG_TERM_DISABILITY',
  'INCOME_UNEMPLOYMENT', 'INCOME_INTEREST_EARNED', 'INCOME_DIVIDENDS',
]);
