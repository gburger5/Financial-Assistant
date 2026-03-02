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
  debts: BudgetAmount;
  investments: BudgetAmount;
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
  debts: BudgetAmount;
  investments: BudgetAmount;
}>;

export const CATEGORY_MAP = {
  income: [
    'INCOME_SALARY', 'INCOME_GIG_ECONOMY', 'INCOME_OTHER',
    'INCOME_MILITARY', 'INCOME_RENTAL', 'INCOME_LONG_TERM_DISABILITY',
    'INCOME_UNEMPLOYMENT',
  ],
  housing: [
    'RENT_AND_UTILITIES_RENT',
    'LOAN_PAYMENTS_MORTGAGE_PAYMENT',
  ],
  utilities: [
    'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY',
    'RENT_AND_UTILITIES_INTERNET_AND_CABLE',
    'RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT',
    'RENT_AND_UTILITIES_TELEPHONE',
    'RENT_AND_UTILITIES_WATER',
    'RENT_AND_UTILITIES_OTHER_UTILITIES',
  ],
  transportation: [
    'TRANSPORTATION_BIKES_AND_SCOOTERS', 'TRANSPORTATION_GAS',
    'TRANSPORTATION_PARKING', 'TRANSPORTATION_PUBLIC_TRANSIT',
    'TRANSPORTATION_TAXIS_AND_RIDE_SHARES', 'TRANSPORTATION_TOLLS',
    'TRANSPORTATION_OTHER_TRANSPORTATION', 'LOAN_PAYMENTS_CAR_PAYMENT',
  ],
  groceries: ['FOOD_AND_DRINK_GROCERIES'],
  takeout: [
    'FOOD_AND_DRINK_RESTAURANT', 'FOOD_AND_DRINK_FAST_FOOD',
    'FOOD_AND_DRINK_COFFEE', 'FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR',
  ],
  shopping: [
    'GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS',
    'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES',
    'GENERAL_MERCHANDISE_CONVENIENCE_STORES',
    'GENERAL_MERCHANDISE_DEPARTMENT_STORES',
    'GENERAL_MERCHANDISE_DISCOUNT_STORES',
    'GENERAL_MERCHANDISE_ELECTRONICS',
    'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES',
    'GENERAL_MERCHANDISE_OFFICE_SUPPLIES',
    'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES',
    'GENERAL_MERCHANDISE_PET_SUPPLIES',
    'GENERAL_MERCHANDISE_SPORTING_GOODS',
    'GENERAL_MERCHANDISE_SUPERSTORES',
    'GENERAL_MERCHANDISE_TOBACCO_AND_VAPE',
    'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
  ],
  personalCare: [
    'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS',
    'PERSONAL_CARE_HAIR_AND_BEAUTY',
    'PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING',
    'PERSONAL_CARE_OTHER_PERSONAL_CARE',
  ],
  investments: ['TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS'],
} as const;
