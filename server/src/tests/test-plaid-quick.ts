import 'dotenv/config';
import { plaidClient } from '../lib/plaidClient.js';

async function test() {
  const res1 = await plaidClient.sandboxPublicTokenCreate({
    institution_id: 'ins_109508',
    initial_products: ['transactions'],
    options: { override_username: 'user_good', override_password: 'pass_good' }
  } as any);
  const res2 = await plaidClient.itemPublicTokenExchange({ public_token: res1.data.public_token });
  const access_token = res2.data.access_token;

  // Immediate call - gets NOT_READY and next_cursor=""
  const r1 = await plaidClient.transactionsSync({ access_token, options: { include_personal_finance_category: true } });
  console.log('Immediate: status=%s next_cursor=%s', r1.data.transactions_update_status, JSON.stringify(r1.data.next_cursor));

  // Wait for data to be ready
  await new Promise(r => setTimeout(r, 4000));

  // Now call with cursor="" (what the code would do after saving the empty cursor)
  const r2 = await plaidClient.transactionsSync({ access_token, cursor: '', options: { include_personal_finance_category: true } });
  console.log('With cursor="": accounts=%d added=%d status=%s', r2.data.accounts.length, r2.data.added.length, r2.data.transactions_update_status);

  // Call with cursor=undefined (what we want)
  const r3 = await plaidClient.transactionsSync({ access_token, cursor: undefined, options: { include_personal_finance_category: true } });
  console.log('With cursor=undefined: accounts=%d added=%d status=%s', r3.data.accounts.length, r3.data.added.length, r3.data.transactions_update_status);
}

test().catch(e => console.error('ERROR:', JSON.stringify(e?.response?.data) ?? e.message));
