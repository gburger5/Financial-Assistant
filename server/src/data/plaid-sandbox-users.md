# Plaid Sandbox Test Users

Custom users created in the Plaid Sandbox dashboard for end-to-end testing.

For logging in, use anything for the password and MFA prompt:
- Use Chase Bank to login custom_user_depository
- Use Charles Schwab to login custom_user_investments
- Use First Platypus Bank to login custom_user_debts

---
# Custom user 1: New Grad Woman

## custom_user_depository

**Description:** Checking and savings accounts for basic_girl

### Account 1: Primary Checking

- **Account:** Primary Checking (Plaid Premier Checking Account)
- **Type:** depository / checking
- **Starting Balance:** $4,200.00

#### Transactions (January 2026)

| Date | Description | Amount |
|------|-------------|--------|
| 01/01 | DIRECT DEPOSIT - ACME CORP PAYROLL | -$2,800.00 |
| 01/01 | ONLINE TRANSFER TO SAVINGS - EMERGENCY FUND | $200.00 |
| 01/01 | ONLINE TRANSFER TO SAVINGS - VACATION FUND | $100.00 |
| 01/01 | ONLINE TRANSFER TO FIDELITY - ROTH IRA CONTRIBUTION | $291.67 |
| 01/02 | ONLINE TRANSFER - RIVERSIDE APARTMENTS | $1,500.00 |
| 01/04 | SHELL #4821 | $33.81 |
| 01/06 | CITY POWER & LIGHT - AUTOPAY | $50.00 |
| 01/05 | WHOLE FOODS MARKET | $110.38 |
| 01/10 | NAVIENT STUDENT LOAN PAYMENT | $412.00 |
| 01/11 | CHEVRON #1092 | $39.84 |
| 01/12 | KROGER #0421 | $125.20 |
| 01/15 | DIRECT DEPOSIT - ACME CORP PAYROLL | -$2,800.00 |
| 01/15 | ONLINE TRANSFER TO SAVINGS - EMERGENCY FUND | $200.00 |
| 01/15 | ONLINE TRANSFER TO SAVINGS - VACATION FUND | $100.00 |
| 01/15 | ONLINE TRANSFER TO FIDELITY - ROTH IRA CONTRIBUTION | $291.67 |
| 01/19 | EXXON #3341 | $32.11 |
| 01/19 | TRADER JOE'S | $107.17 |
| 01/24 | ULTA BEAUTY #0442 | $90.90 |
| 01/25 | CHICK-FIL-A #0442 | $20.44 |
| 01/26 | WHOLE FOODS MARKET | $83.96 |
| 01/27 | SPEEDWAY #8823 | $36.38 |
| 01/28 | CHASE CREDIT CARD PAYMENT - SAPPHIRE PREFERRED | $35.00 |
| 01/28 | APPLE CARD PAYMENT - GOLDMAN SACHS | $55.00 |

**Monthly income:** $5,600 (2 biweekly paychecks)

### Account 2: High-Yield Savings — Emergency Fund

- **Account:** High-Yield Savings - Emergency Fund (Chase High Yield Savings Account)
- **Type:** depository / savings
- **Starting Balance:** $5,200.00

#### Transactions (January 2026)

| Date | Description | Amount |
|------|-------------|--------|
| 01/01 | ONLINE TRANSFER FROM CHECKING - EMERGENCY FUND | -$200.00 |
| 01/15 | ONLINE TRANSFER FROM CHECKING - EMERGENCY FUND | -$200.00 |
| 01/31 | INTEREST PAYMENT | -$21.65 |

**Monthly contributions:** $400 (2 transfers aligned with paydays)
**Monthly interest:** ~$21.65

### Account 3: High-Yield Savings — Vacation Fund

- **Account:** High-Yield Savings - Vacation Fund (Chase High Yield Savings Account)
- **Type:** depository / savings
- **Starting Balance:** $3,550.00

#### Transactions (January 2026)

| Date | Description | Amount |
|------|-------------|--------|
| 01/01 | ONLINE TRANSFER FROM CHECKING - VACATION FUND | -$100.00 |
| 01/15 | ONLINE TRANSFER FROM CHECKING - VACATION FUND | -$100.00 |
| 01/31 | INTEREST PAYMENT | -$14.80 |

**Monthly contributions:** $200 (2 transfers aligned with paydays)
**Monthly interest:** ~$14.80

---

## custom_user_investments

**Description:** Investment portfolio of custom user

### Account 1: Roth 401(k) — Acme Corp Roth 401(k) Plan

- **Type:** investment / roth 401k
- **Starting Balance:** $48,250.00

#### Holdings (as of 2026-01-27)

| Security | Ticker | Qty | Price | Cost Basis | Market Value |
|----------|--------|-----|-------|------------|-------------|
| Fidelity 500 Index Fund | FXAIX | 120.50 | $38.92 | $28.50 | $4,690.86 |
| Fidelity Total Market Index Fund | FSKAX | 85.00 | $124.18 | $95.00 | $10,555.30 |
| Fidelity Total International Index Fund | FTIHX | 40.00 | $118.45 | $88.00 | $4,738.00 |

#### Investment Transactions (January 2026)

| Date | Description | Type | Qty | Price | Security |
|------|-------------|------|-----|-------|----------|
| 01/01 | Employee Contribution - Roth 401(k) | cash | — | — | USD |
| 01/01 | Employer Match - Acme Corp (50% of 6%) | cash | — | — | USD |
| 01/01 | Buy FXAIX | buy | 3.96 | $38.20 | FXAIX |
| 01/01 | Buy FSKAX | buy | 0.83 | $122.10 | FSKAX |
| 01/15 | Employee Contribution - Roth 401(k) | cash | — | — | USD |
| 01/15 | Employer Match - Acme Corp (50% of 6%) | cash | — | — | USD |
| 01/15 | Buy FXAIX | buy | 3.96 | $38.55 | FXAIX |
| 01/15 | Buy FSKAX | buy | 0.82 | $123.40 | FSKAX |

### Account 2: Roth IRA — Fidelity Roth IRA

- **Type:** investment / roth
- **Starting Balance:** $18,400.00

#### Holdings (as of 2026-01-27)

| Security | Ticker | Qty | Price | Cost Basis | Market Value |
|----------|--------|-----|-------|------------|-------------|
| Vanguard Total Stock Market ETF | VTI | 95.00 | $118.32 | $88.00 | $11,240.40 |
| Vanguard Total International Stock ETF | VXUS | 45.00 | $72.14 | $55.00 | $3,246.30 |
| Vanguard Total Bond Market ETF | BND | 20.00 | $84.61 | $72.00 | $1,692.20 |

#### Investment Transactions (January 2026)

| Date | Description | Type | Qty | Price | Security |
|------|-------------|------|-----|-------|----------|
| 01/01 | Roth IRA Contribution | cash | — | — | USD |
| 01/01 | Buy VTI | buy | 1.73 | $117.80 | VTI |
| 01/01 | Buy VXUS | buy | 1.22 | $71.50 | VXUS |
| 01/15 | Roth IRA Contribution | cash | — | — | USD |
| 01/15 | Buy VTI | buy | 1.73 | $118.40 | VTI |
| 01/15 | Buy VXUS | buy | 1.22 | $71.90 | VXUS |
| 01/20 | INCOME DIV VTI DIVIDEND | cash | — | — | USD |
| 01/20 | Dividend Reinvestment VTI | buy | 0.312 | $118.10 | VTI |

---

## custom_user_debts

**Description:** Debts of basic_girl

### Account 1: Chase Sapphire Preferred (credit card)

- **Type:** credit / credit card
- **Starting Balance:** $1,840.00
- **Credit Limit:** $5,000
- **Purchase APR:** 22.99%
- **Cash APR:** 29.99%
- **Balance Transfer APR:** 22.99%
- **Last Payment:** $35.00
- **Minimum Payment:** $35.00

#### Transactions (January 2026)

| Date | Description | Amount |
|------|-------------|--------|
| 01/07 | CHIPOTLE #0293 | $11.00 |
| 01/10 | AMAZON.COM | $102.06 |
| 01/15 | DOORDASH*THAI ORCHID | $23.79 |
| 01/19 | TARGET #0821 | $127.38 |
| 01/23 | UBER EATS*PIZZA PALACE | $26.72 |
| 01/28 | PAYMENT - THANK YOU | -$35.00 |

### Account 2: Apple Card (credit card)

- **Type:** credit / credit card
- **Starting Balance:** $3,120.00
- **Credit Limit:** $6,000
- **Purchase APR:** 19.99%
- **Cash APR:** 24.99%
- **Balance Transfer APR:** 19.99%
- **Last Payment:** $55.00
- **Minimum Payment:** $55.00

#### Transactions (January 2026)

| Date | Description | Amount |
|------|-------------|--------|
| 01/04 | APPLE ONE SUBSCRIPTION | $14.99 |
| 01/09 | GREAT CLIPS | $41.15 |
| 01/11 | MCDONALD'S #8821 | $24.87 |
| 01/18 | CVS PHARMACY #3821 | $47.36 |
| 01/24 | H&M #3341 | $121.27 |
| 01/28 | PAYMENT - THANK YOU | -$55.00 |

### Account 3: Navient Student Loan

- **Type:** loan / student
- **Starting Balance:** $34,500.00
- **Original Principal:** $38,000.00
- **Origination Date:** 2022-08-15
- **APR:** 5.50%
- **Minimum Payment:** $412.00

#### Transactions (January 2026)

| Date | Description | Amount |
|------|-------------|--------|
| 01/10 | NAVIENT STUDENT LOAN PAYMENT | $412.00 |

---
