import type { PageId, Notification } from '../types/dashboard'

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 1, icon: '⚠️', iconBg: 'rgba(239,68,68,0.1)',   title: 'Budget Alert',       desc: 'Dining out is at 87% of your monthly budget.',         time: '2m ago',     unread: true,  type: 'alert'  },
  { id: 2, icon: '💡', iconBg: 'rgba(0,212,170,0.1)',   title: 'AI Tip',             desc: 'You could save $142/mo by switching your phone plan.', time: '1h ago',     unread: true,  type: 'tip'    },
  { id: 3, icon: '✅', iconBg: 'rgba(0,212,170,0.1)',   title: 'Goal Milestone',     desc: 'Emergency fund just hit 50% — great progress!',        time: '3h ago',     unread: true,  type: 'action' },
  { id: 4, icon: '💳', iconBg: 'rgba(69,123,157,0.1)',  title: 'Large Transaction',  desc: 'A charge of $348.00 was detected at Best Buy.',        time: 'Yesterday',  unread: false, type: 'alert'  },
  { id: 5, icon: '📈', iconBg: 'rgba(69,123,157,0.1)',  title: 'Investment Update',  desc: 'Your portfolio is up 2.4% this week.',                 time: '2 days ago', unread: false, type: 'update' },
  { id: 6, icon: '🔁', iconBg: 'rgba(245,158,11,0.1)',  title: 'Bill Due Soon',      desc: 'Your electric bill (~$95) is due in 3 days.',          time: '2 days ago', unread: false, type: 'alert'  },
]

export const MOCK_TRANSACTIONS = [
  { id: 1, name: 'Whole Foods Market', category: 'Groceries',     date: 'Feb 22', amount: -127.43, icon: '🛒', iconBg: 'rgba(0,212,170,0.1)'   },
  { id: 2, name: 'Direct Deposit',     category: 'Income',        date: 'Feb 21', amount: 3250.00, icon: '💰', iconBg: 'rgba(0,168,132,0.1)'   },
  { id: 3, name: 'Netflix',            category: 'Subscriptions', date: 'Feb 20', amount: -15.99,  icon: '📱', iconBg: 'rgba(69,123,157,0.1)'  },
  { id: 4, name: 'Shell Gas Station',  category: 'Transport',     date: 'Feb 20', amount: -58.20,  icon: '⛽', iconBg: 'rgba(245,158,11,0.1)'  },
  { id: 5, name: 'Chipotle',           category: 'Dining',        date: 'Feb 19', amount: -14.75,  icon: '🌯', iconBg: 'rgba(239,68,68,0.1)'   },
  { id: 6, name: 'Amazon',             category: 'Shopping',      date: 'Feb 18', amount: -89.99,  icon: '📦', iconBg: 'rgba(69,123,157,0.1)'  },
  { id: 7, name: 'Spotify',            category: 'Subscriptions', date: 'Feb 17', amount: -9.99,   icon: '🎵', iconBg: 'rgba(69,123,157,0.1)'  },
  { id: 8, name: 'Freelance Payment',  category: 'Income',        date: 'Feb 15', amount: 750.00,  icon: '💼', iconBg: 'rgba(0,168,132,0.1)'   },
]

export const MOCK_BUDGET = [
  { name: 'Housing',       spent: 1450, budget: 1500, color: '#457B9D', icon: '🏠' },
  { name: 'Food',          spent: 387,  budget: 500,  color: '#00D4AA', icon: '🛒' },
  { name: 'Transport',     spent: 220,  budget: 300,  color: '#F59E0B', icon: '🚗' },
  { name: 'Dining Out',    spent: 174,  budget: 200,  color: '#EF4444', icon: '🍽️' },
  { name: 'Shopping',      spent: 245,  budget: 300,  color: '#8B5CF6', icon: '🛍️' },
  { name: 'Subscriptions', spent: 55,   budget: 80,   color: '#64748B', icon: '📱' },
]

export const MOCK_GOALS = [
  { name: 'Emergency Fund',  target: 15000, saved: 7540, icon: '🛡️', color: '#00D4AA', deadline: 'Dec 2025' },
  { name: 'Europe Trip',     target: 4000,  saved: 1200, icon: '✈️', color: '#457B9D', deadline: 'Aug 2025' },
  { name: 'New MacBook',     target: 2500,  saved: 2500, icon: '💻', color: '#8B5CF6', deadline: 'Completed' },
  { name: 'House Down Pymt', target: 50000, saved: 8000, icon: '🏡', color: '#F59E0B', deadline: 'Dec 2027' },
]

export const MOCK_DEBTS = [
  { name: 'Chase Sapphire', balance: 3240,  rate: 22.9, minimum: 65,  type: 'Credit Card',  icon: '💳', severity: 'high' },
  { name: 'Student Loan',   balance: 18500, rate: 5.4,  minimum: 210, type: 'Student Loan', icon: '🎓', severity: 'low'  },
  { name: 'Auto Loan',      balance: 9800,  rate: 7.9,  minimum: 280, type: 'Auto Loan',    icon: '🚗', severity: 'low'  },
]

export const MOCK_SUGGESTIONS = [
  { title: 'Cancel unused subscriptions',  desc: 'Found 3 subscriptions totaling $47/mo that appear unused. Review before cancelling.',  time: '2 hours ago', status: 'review',    icon: '🤖', iconBg: 'rgba(0,212,170,0.1)'   },
  { title: 'Round-up spare change',        desc: 'Transfer $23.47 in round-ups to your emergency fund. Approve to proceed.',            time: '1 day ago',   status: 'pending',   icon: '🪙', iconBg: 'rgba(69,123,157,0.1)'  },
  { title: 'Review irregular charge',      desc: 'A $12.99 charge from an unknown merchant was flagged. Confirm if this is legitimate.', time: '2 days ago',  status: 'pending',   icon: '🔍', iconBg: 'rgba(239,68,68,0.1)'   },
  { title: 'Rebalance budget categories',  desc: 'Suggest shifting $50 from Shopping to Groceries based on your patterns. Approve?',    time: '5 days ago',  status: 'completed', icon: '⚖️', iconBg: 'rgba(245,158,11,0.1)'  },
]

export const NAV_ITEMS: { id: PageId; label: string; icon: string }[] = [
  { id: 'overview',      label: 'Overview',      icon: '📊' },
  { id: 'transactions',  label: 'Transactions',  icon: '💳' },
  { id: 'budget',        label: 'Budget',        icon: '📋' },
  { id: 'investments',   label: 'Investments',   icon: '📈' },
  { id: 'goals',         label: 'Goals',         icon: '🎯' },
  { id: 'debts',         label: 'Debts',         icon: '💰' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
]

export const PAGE_TITLES: Record<PageId, { title: string; subtitle: string }> = {
  overview:      { title: 'Dashboard',     subtitle: 'Your financial overview'  },
  transactions:  { title: 'Transactions',  subtitle: 'All account activity'     },
  budget:        { title: 'Budget',        subtitle: 'Monthly spending plan'    },
  investments:   { title: 'Investments',   subtitle: 'Portfolio & accounts'     },
  goals:         { title: 'Goals',         subtitle: 'Savings progress'         },
  debts:         { title: 'Debts',         subtitle: 'Payoff tracking'          },
  notifications: { title: 'Notifications', subtitle: 'Alerts & updates'         },
  profile:       { title: 'Profile',       subtitle: 'Account & preferences'    },
  settings:      { title: 'Settings',      subtitle: 'App configuration'        },
}