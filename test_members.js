import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nxpiitewjlwernaysupm.supabase.co',
  'sb_publishable_UGztkxks_CPTnYMvoK_73w_sHM2B97h'
);

async function run() {
  const { data: groups, error: gErr } = await supabase.from('groups').select('*');
  if (gErr) return console.error(gErr);
  
  const target = groups.find(g => g.name.toLowerCase().includes('lion'));
  if (!target) return console.log('No group named Lion found. Groups:', groups.map(g => g.name));
  
  console.log(`Found group: ${target.name} (ID: ${target.id})`);
  const { data: members, error: mErr } = await supabase.from('group_members').select('*').eq('group_id', target.id);
  if (mErr) return console.error(mErr);
  
  console.log('MEMBERS:');
  members.forEach(m => {
    console.log(`- ID: ${m.id}, Name: "${m.name}", pending: ${m.is_pending}, user_email: ${m.user_email}, invite_email: ${m.invite_email}, person_id: ${m.person_id}, is_deleted: ${m.is_deleted}`);
  });
}

run();
