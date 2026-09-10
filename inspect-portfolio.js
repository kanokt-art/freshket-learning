const admin = require('firebase-admin');
const serviceAccount = require('./lms-sale-project-firebase-adminsdk-fbsvc-44bc76c1e5.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function inspect() {
  const snap = await db.collection('users').get();
  const allDocs = [];
  snap.forEach(doc => allDocs.push({ id: doc.id, ...doc.data() }));

  const portfolioEmails = new Set();
  const csvDocs = [];
  const authDocs = [];
  const noEmailDocs = [];

  for (const u of allDocs) {
    const dept = u.department || '';
    if (dept.includes('Portfolio')) {
      portfolioEmails.add((u.email || '').toLowerCase());
      if (u.id?.startsWith('csv-') || (u.uid || u.id || '').startsWith('csv-')) {
        csvDocs.push(u);
      } else {
        authDocs.push(u);
      }
    }
  }

  console.log('\n=== CSV docs with Portfolio Management ===');
  for (const u of csvDocs) {
    console.log(`  UID: ${u.uid || u.id} | email: ${u.email} | dept: "${u.department}" | teamId: ${u.teamId || 'NONE'}`);
  }

  console.log('\n=== Auth docs with Portfolio Management ===');
  for (const u of authDocs) {
    console.log(`  UID: ${u.uid || u.id} | email: ${u.email} | dept: "${u.department}" | teamId: ${u.teamId || 'NONE'}`);
  }

  // Now check: for those Portfolio emails, is there an auth doc WITHOUT Portfolio dept?
  console.log('\n=== Auth docs matching Portfolio CSV emails (dept may differ) ===');
  for (const u of allDocs) {
    const uid = u.uid || u.id || '';
    if (uid.startsWith('csv-')) continue;
    const email = (u.email || '').toLowerCase();
    if (portfolioEmails.has(email)) {
      console.log(`  UID: ${uid} | email: ${u.email} | dept: "${u.department ?? 'MISSING'}" | role: ${u.role} | teamId: ${u.teamId || 'NONE'}`);
    }
  }
}

inspect().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
